// Offline wiring test: replays the recorded demo outputs through the orchestrator with a stubbed /api/agent.
// Proves the phases, the parallel groups, the repair routing and the pack build, without calling Gemini.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { runPipeline, type RunState } from "../lib/orchestrator";
import type { AgentRequest, DocFile } from "../lib/types";

const ROOT = resolve(__dirname, "..", "..");
const CASE = join(ROOT, "demo_dataset/sambal-mak-embun");
const OUT = join(CASE, "halalpilot-output");

const read = (f: string) => JSON.parse(readFileSync(join(OUT, f), "utf8").replace(/^\uFEFF/, ""));
const recorded = {
  clerk: read("01-case-manifest.json"),
  investigator: read("02-ingredient-matrix.json"),
  "process-builder": read("03-process-pack.json"),
  auditor: read("04-audit-report.json"),
};

function inventory(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      if (n !== "halalpilot-output" && !n.startsWith(".")) out.push(...inventory(p, base));
    } else if (!n.startsWith(".")) out.push(relative(base, p).split("\\").join("/"));
  }
  return out;
}

const inv = inventory(CASE);
const files: DocFile[] = inv.map((path, i) => ({
  doc_id: `DOC-${String(i + 1).padStart(3, "0")}`,
  path,
  kind: /\.(jpg|jpeg|png)$/i.test(path) ? "image" : "text",
  text: "stub",
  ...(/\.(jpg|jpeg|png)$/i.test(path) ? { mime: "image/jpeg", data: "AAAA" } : {}),
}));

type Scenario = "clean" | "broken-matrix" | "auditor-fails";
let scenario: Scenario = "clean";
const calls: { role: string; mode: string }[] = [];

(globalThis as any).fetch = async (_url: string, init: any) => {
  const body = JSON.parse(init.body) as AgentRequest;
  const mode = body.mode ?? "build";
  calls.push({ role: body.role, mode });
  if (scenario === "auditor-fails" && body.role === "auditor") {
    return { ok: false, status: 502, json: async () => ({ ok: false, error: "simulated model outage", code: "UPSTREAM" }) };
  }
  let json: any = JSON.parse(JSON.stringify(recorded[body.role]));
  if (body.role === "clerk") json.as_of = body.asOf;
  if (body.role === "investigator") {
    json.as_of = body.asOf;
    // The recorded demo is already clean; break one row on the first build to exercise the repair loop.
    if (scenario === "broken-matrix" && mode === "build") json.rows[0].verdict = "VERIFIED"; // no cert_id → UNKNOWN_CERT
  }
  return { ok: true, status: 200, json: async () => ({ ok: true, json, ms: 10, model: "stub" }) };
};

async function run(s: Scenario): Promise<RunState> {
  scenario = s;
  calls.length = 0;
  return runPipeline({ files, inventory: inv, ownerPrompt: "Get me ready for halal certification." }, () => {});
}

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond || !detail ? "" : `  — ${detail}`}`);
  if (!cond) failures++;
};

// The recorded run used as_of 2026-10-10; today's date shifts certificate verdicts, so only structure is asserted.
async function main() {
const clean = await run("clean");
check("clean: no fatal error", !clean.error, clean.error ?? "");
check("clean: produced a readiness pack", !!clean.pack && clean.pack.includes("Halal Certification Readiness Pack"));
check("clean: pack cites the score from the validator", clean.pack!.includes(`${clean.validation!.readiness!.score} / 100`));
check("clean: all four agents ran", new Set(calls.map((c) => c.role)).size === 4, JSON.stringify(calls));
check(
  "clean: phase 2 builders are one parallel group",
  clean.steps.filter((s) => s.group.startsWith("Phase 2")).every((s) => s.parallel) &&
    clean.steps.filter((s) => s.group.startsWith("Phase 2")).length === 2,
);
check("clean: phase 3 runs validator + auditor together", clean.steps.filter((s) => s.group.startsWith("Phase 3")).length === 2);
check("clean: every step finished", clean.steps.every((s) => s.status === "done"), JSON.stringify(clean.steps.filter((s) => s.status !== "done")));
check("clean: ingredient x-ray table in pack", clean.pack!.includes("## 2. Ingredient X-ray"));
check("clean: appendix B lists NEEDS_REVIEW items", clean.pack!.includes("## Appendix B"));

const broken = await run("broken-matrix");
const repairCalls = calls.filter((c) => c.mode === "repair");
check("repair: the loop dispatched a repair", repairCalls.length > 0, JSON.stringify(calls));
check("repair: it went to the investigator", repairCalls.every((c) => c.role === "investigator"), JSON.stringify(repairCalls));
check("repair: the pack ends with 0 validator errors", broken.validation!.errors.length === 0, JSON.stringify(broken.validation!.errors.slice(0, 3)));
check("repair: the round was logged", (broken.repairLog?.rounds.length ?? 0) >= 1);

const noAudit = await run("auditor-fails");
check("degraded: the run still finishes", !noAudit.error && !!noAudit.pack, noAudit.error ?? "");
check("degraded: the audit step is marked failed", noAudit.steps.some((s) => s.actor === "auditor" && s.status === "failed"));
check("degraded: the pack says the audit did not complete", noAudit.pack!.includes("audit step did not complete"));

console.log(failures ? `\n${failures} failure(s)` : "\npipeline: all checks passed");
process.exit(failures ? 1 : 0);
}

void main();
