// Client-side team lead: mirrors halalpilot/agents/halalpilot-team-lead.md.
// Each agent phase is one stateless POST /api/agent; parallel phases are real Promise.all.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { AGENT_META, ROLE_BY_AGENT_ID, type AgentError, type AgentRequest, type AgentResponse, type DocFile, type Role } from "./types";
import { FILES, validate, type Part, type ValidationReport } from "./validate";
import { buildReadinessPack } from "./pack";

export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped";
export type Actor = Role | "validator" | "lead";

export interface Step {
  id: string;
  group: string;
  parallel: boolean;
  actor: Actor;
  label: string;
  status: StepStatus;
  startedAt?: number;
  ms?: number;
  note?: string;
}

export interface RepairRound {
  round: number;
  validation_errors_before: number;
  audit_findings_routed: string[];
  dispatched: { agent: string; items: string[]; result: string }[];
  validation_errors_after: number;
  audit_verdict_after: string | null;
}

export interface RunState {
  asOf: string;
  steps: Step[];
  data: Partial<Record<Part, any>>;
  validation: ValidationReport | null;
  repairLog: { schema: string; rounds: RepairRound[]; stopped_because: string } | null;
  pack: string | null;
  error: string | null;
  done: boolean;
  auditAvailable: boolean;
}

export interface RunOptions {
  files: DocFile[];
  inventory: string[];
  ownerPrompt: string;
  accessCode?: string;
  maxRepairRounds?: number;
  /** Replay injects a recorded transport here; everything else runs for real. */
  fetchImpl?: typeof fetch;
}

const PART_BY_ROLE: Record<Role, Part> = {
  clerk: "manifest",
  investigator: "matrix",
  "process-builder": "process",
  auditor: "audit",
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

class StepFailure extends Error {}

async function callAgent(req: AgentRequest, accessCode?: string, signal?: AbortSignal, fetchImpl?: typeof fetch): Promise<AgentResponse> {
  const doFetch = fetchImpl ?? fetch;
  let lastErr = "Request failed";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await doFetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json", ...(accessCode ? { "x-access-code": accessCode } : {}) },
        body: JSON.stringify(req),
        signal,
      });
      let body: AgentResponse | AgentError;
      try {
        body = await res.json();
      } catch {
        throw new Error(`Server returned ${res.status} without JSON (request too large or timed out?)`);
      }
      if (body.ok) return body;
      lastErr = body.error;
      if (body.code === "QUOTA" && attempt < 2) {
        await sleep(15_000);
        continue;
      }
      throw new StepFailure(body.error);
    } catch (e: any) {
      if (e?.name === "AbortError") throw e;
      if (e instanceof StepFailure) throw e;
      lastErr = String(e?.message ?? e);
      if (attempt < 2) {
        await sleep(2_000);
        continue;
      }
    }
  }
  throw new StepFailure(lastErr);
}

function isPackFile(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v) && typeof (v as any).schema === "string";
}

const EXPECTED_SCHEMA: Record<Role, string> = {
  clerk: "halalpilot/case-manifest@1",
  investigator: "halalpilot/ingredient-matrix@1",
  "process-builder": "halalpilot/process-pack@1",
  auditor: "halalpilot/audit-report@1",
};
const SHAPE_KEY: Record<Role, string> = {
  clerk: "documents",
  investigator: "rows",
  "process-builder": "flows",
  auditor: "findings",
};

/**
 * Models occasionally drop the `schema` string or nest the file under a wrapper key.
 * Recover when the payload is recognisably the right file; return null when it is not.
 */
function coercePackFile(v: unknown, role: Role): Record<string, any> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const outer = v as Record<string, any>;
  const nested = Object.values(outer).find(
    (x) => x && typeof x === "object" && !Array.isArray(x) && typeof (x as any).schema === "string",
  ) as Record<string, any> | undefined;
  const obj = typeof outer.schema === "string" ? outer : (nested ?? outer);
  if (typeof obj.schema !== "string") {
    if (!Array.isArray(obj[SHAPE_KEY[role]])) return null;
    obj.schema = EXPECTED_SCHEMA[role]; // right shape, missing label — the validator still checks the contents
  }
  return obj;
}

/** One agent call that must return its output file. Retries once on an unusable shape. */
async function callAgentFile(
  req: AgentRequest,
  role: Role,
  accessCode?: string,
  signal?: AbortSignal,
  fetchImpl?: typeof fetch,
): Promise<Record<string, any>> {
  let last: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await callAgent(req, accessCode, signal, fetchImpl);
    const fixed = coercePackFile(r.json, role);
    if (fixed) return fixed;
    last = r.json;
  }
  const keys = last && typeof last === "object" ? Object.keys(last).slice(0, 6).join(", ") : typeof last;
  throw new StepFailure(`${AGENT_META[role].name} returned an unexpected shape (keys: ${keys})`);
}

export async function runPipeline(opts: RunOptions, onUpdate: (s: RunState) => void, signal?: AbortSignal): Promise<RunState> {
  const asOf = localToday();
  const maxRounds = opts.maxRepairRounds ?? 2;
  const state: RunState = {
    asOf,
    steps: [],
    data: {},
    validation: null,
    repairLog: null,
    pack: null,
    error: null,
    done: false,
    auditAvailable: false,
  };
  const emit = () => onUpdate({ ...state, steps: state.steps.map((s) => ({ ...s })), data: { ...state.data } });

  const addStep = (group: string, parallel: boolean, actor: Actor, label: string): Step => {
    const s: Step = { id: `${state.steps.length}-${actor}`, group, parallel, actor, label, status: "pending" };
    state.steps.push(s);
    emit();
    return s;
  };
  const track = async <T,>(step: Step, fn: () => Promise<T>): Promise<T> => {
    step.status = "running";
    step.startedAt = Date.now();
    emit();
    try {
      const out = await fn();
      step.status = "done";
      step.ms = Date.now() - step.startedAt;
      emit();
      return out;
    } catch (e: any) {
      step.status = "failed";
      step.ms = Date.now() - (step.startedAt ?? Date.now());
      step.note = String(e?.message ?? e).slice(0, 240);
      emit();
      throw e;
    }
  };

  const runValidator = (): ValidationReport => {
    const v = validate({ ...state.data, inventory: opts.inventory, asOf });
    state.validation = v;
    return v;
  };
  const base = { asOf, ownerPrompt: opts.ownerPrompt };

  try {
    // Phase 0: intake (done in the browser before we get here)
    const intake = addStep("Phase 0 · Intake", false, "lead", `Inventory ${opts.files.length} files, assign document ids, as_of ${asOf}`);
    await track(intake, async () => undefined);

    // Phase 1: Evidence Clerk, then gate G1
    const g1 = "Phase 1 · Evidence extraction";
    const clerk = addStep(g1, false, "clerk", AGENT_META.clerk.job);
    const manifest = await track(clerk, () =>
      callAgentFile({ ...base, role: "clerk", files: opts.files }, "clerk", opts.accessCode, signal, opts.fetchImpl),
    );
    state.data.manifest = manifest;
    emit();

    for (let attempt = 1; attempt <= 2; attempt++) {
      const v = runValidator();
      const mine = v.errors.filter((e) => e.file === FILES.manifest);
      if (!mine.length) break;
      const fix = addStep(g1, false, "clerk", `Gate G1: fix ${mine.length} manifest error(s) (try ${attempt}/2)`);
      try {
        const repaired = await track(fix, () =>
          callAgentFile(
            { ...base, role: "clerk", mode: "repair", files: opts.files, current: state.data.manifest, issues: mine.slice(0, 40).map(slim) },
            "clerk",
            opts.accessCode,
            signal,
            opts.fetchImpl,
          ),
        );
        state.data.manifest = repaired;
      } catch (e: any) {
        if (e?.name === "AbortError") throw e;
        break;
      }
    }
    if (!(state.data.manifest?.products ?? []).length) {
      throw new StepFailure("No products or recipes could be extracted. Add recipes and supplier invoices to the zip and try again.");
    }

    // Phase 2: build in parallel
    const g2 = "Phase 2 · Build (parallel)";
    const inv = addStep(g2, true, "investigator", AGENT_META.investigator.job);
    const pb = addStep(g2, true, "process-builder", AGENT_META["process-builder"].job);
    const build = (role: Role, step: Step) =>
      track(step, async () => {
        state.data[PART_BY_ROLE[role]] = await callAgentFile(
          { ...base, role, manifest: state.data.manifest },
          role,
          opts.accessCode,
          signal,
          opts.fetchImpl,
        );
        emit();
      });
    const built = await Promise.allSettled([build("investigator", inv), build("process-builder", pb)]);
    const failed = built.find((b) => b.status === "rejected") as PromiseRejectedResult | undefined;
    if (failed) throw failed.reason;

    // Phase 3: validator in parallel with the independent auditor
    const audit = async (round: number, group: string): Promise<void> => {
      const step = addStep(group, true, "auditor", `${AGENT_META.auditor.job} (round ${round})`);
      try {
        await track(step, async () => {
          state.data.audit = await callAgentFile(
            {
              ...base,
              role: "auditor",
              round,
              files: opts.files.map((f) => (f.kind === "text" ? f : { ...f, data: undefined })),
              manifest: state.data.manifest,
              matrix: state.data.matrix,
              process: state.data.process,
              previousAudit: state.data.audit,
            },
            "auditor",
            opts.accessCode,
            signal,
            opts.fetchImpl,
          );
          state.auditAvailable = true;
          emit();
        });
      } catch (e: any) {
        if (e?.name === "AbortError") throw e;
        // The audit is a quality gate, not a prerequisite: keep going and say so in the pack.
      }
    };
    const phase3 = async (round: number, group: string) => {
      const vs = addStep(group, true, "validator", "validate_pack: integrity + score (runs in your browser)");
      await Promise.all([
        track(vs, async () => {
          runValidator();
        }),
        audit(round, group),
      ]);
      runValidator();
      emit();
    };
    await phase3(1, "Phase 3 · Validate (parallel)");

    // Phase 4: repair loop
    const rounds: RepairRound[] = [];
    let stopped = "clean";
    for (let round = 1; round <= maxRounds + 1; round++) {
      const { byRole, auditFileErrors } = collectIssues(state.validation!, state.data.audit);
      const ownerActions = (state.data.audit?.findings ?? []).filter((f: any) => f.status === "OWNER_ACTION" || f.fixable_by_team === false).length;
      if (!byRole.size && !auditFileErrors) {
        stopped = ownerActions ? "only_owner_actions_left" : "clean";
        break;
      }
      if (round > maxRounds) {
        stopped = "max_rounds";
        break;
      }
      const group = `Phase 4 · Repair round ${round} (parallel)`;
      const entry: RepairRound = {
        round,
        validation_errors_before: state.validation!.errors.length,
        audit_findings_routed: [...byRole.values()].flat().map((i: any) => i.finding_id).filter(Boolean),
        dispatched: [],
        validation_errors_after: 0,
        audit_verdict_after: null,
      };
      const jobs = [...byRole.entries()].map(([role, issues]) => {
        const step = addStep(group, true, role, `Repair ${issues.length} item(s)`);
        entry.dispatched.push({ agent: AGENT_META[role].id, items: issues.map((i: any) => i.finding_id ?? `${i.code} ${i.pointer}`), result: "pending" });
        const rec = entry.dispatched[entry.dispatched.length - 1];
        return track(step, async () => {
          const part = PART_BY_ROLE[role];
          state.data[part] = await callAgentFile(
            {
              ...base,
              role,
              mode: "repair",
              files: role === "clerk" ? opts.files : undefined,
              manifest: state.data.manifest,
              current: state.data[part],
              issues: issues.slice(0, 40),
            },
            role,
            opts.accessCode,
            signal,
            opts.fetchImpl,
          );
          rec.result = "returned";
          emit();
        }).catch((e) => {
          if (e?.name === "AbortError") throw e;
          rec.result = "failed";
        });
      });
      await Promise.all(jobs);
      await phase3(round + 1, `Phase 4 · Re-validate after round ${round} (parallel)`);
      entry.validation_errors_after = state.validation!.errors.length;
      entry.audit_verdict_after = state.data.audit?.verdict ?? null;
      rounds.push(entry);
      state.repairLog = { schema: "halalpilot/repair-log@1", rounds: [...rounds], stopped_because: stopped };
      emit();
    }
    state.repairLog = { schema: "halalpilot/repair-log@1", rounds, stopped_because: stopped };

    // Phase 5: assemble (no model involved; score comes from the validator)
    const asm = addStep("Phase 5 · Assemble", false, "lead", "Write READINESS-PACK.md from the validated files");
    await track(asm, async () => {
      const v = runValidator();
      state.pack = buildReadinessPack({
        manifest: state.data.manifest,
        matrix: state.data.matrix,
        process: state.data.process,
        audit: state.data.audit,
        validation: v,
        repairRounds: rounds.length,
        auditAvailable: state.auditAvailable,
      });
    });
  } catch (e: any) {
    state.error = e?.name === "AbortError" ? "Run cancelled." : String(e?.message ?? e);
    try {
      if (state.data.manifest) runValidator();
    } catch {
      /* partial state is fine */
    }
  }
  state.done = true;
  emit();
  return state;
}

const slim = (e: { code: string; pointer: string; message: string; file?: string }) => ({
  source: "validator",
  code: e.code,
  file: e.file,
  pointer: e.pointer,
  message: e.message,
});

function collectIssues(v: ValidationReport, audit: any): { byRole: Map<Role, any[]>; auditFileErrors: boolean } {
  const byRole = new Map<Role, any[]>();
  const push = (role: Role, item: any) => byRole.set(role, [...(byRole.get(role) ?? []), item]);
  let auditFileErrors = false;
  for (const e of v.errors) {
    const role = ROLE_BY_AGENT_ID[e.owner];
    if (!role) continue;
    if (role === "auditor") auditFileErrors = true;
    else push(role, slim(e));
  }
  for (const f of audit?.findings ?? []) {
    if (f.status !== "OPEN" || f.fixable_by_team !== true) continue;
    if (f.severity !== "CRITICAL" && f.severity !== "MAJOR") continue;
    const role = ROLE_BY_AGENT_ID[f.owner];
    if (!role || role === "auditor") continue;
    push(role, {
      source: "auditor",
      finding_id: f.finding_id,
      severity: f.severity,
      target: f.target,
      issue: f.issue,
      required_fix: f.required_fix,
      evidence: f.evidence,
    });
  }
  return { byRole, auditFileErrors };
}
