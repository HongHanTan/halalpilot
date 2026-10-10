"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import PROVENANCE from "@/lib/provenance.json";
import type { Actor, RunState, Step, StepStatus } from "@/lib/orchestrator";

const NODES: { actor: Actor; name: string; avatar?: string }[] = [
  { actor: "clerk", name: "Evidence Clerk", avatar: "/avatars/halalpilot-evidence-clerk.png" },
  { actor: "investigator", name: "Ingredient Investigator", avatar: "/avatars/halalpilot-ingredient-investigator.png" },
  { actor: "process-builder", name: "Process Builder", avatar: "/avatars/halalpilot-process-builder.png" },
  { actor: "auditor", name: "Mock Auditor", avatar: "/avatars/halalpilot-mock-auditor.png" },
];

const prov = PROVENANCE as Record<string, { file: string; chars: number; skills: string[] }>;

/** Latest step for an actor wins, so a repair round overrides the original build. */
function statusOf(steps: Step[], actor: Actor): { status: StepStatus; ms: number; label: string } {
  const mine = steps.filter((s) => s.actor === actor);
  if (!mine.length) return { status: "pending", ms: 0, label: "" };
  const running = mine.find((s) => s.status === "running");
  const pick = running ?? mine[mine.length - 1];
  return { status: pick.status, ms: mine.reduce((a, s) => a + (s.ms ?? 0), 0), label: pick.label };
}

/** One line of what this agent actually produced — real numbers beat a spinner. */
function output(actor: Actor, data: RunState["data"]): string {
  const m: any = data.manifest;
  const mx: any = data.matrix;
  const pp: any = data.process;
  const au: any = data.audit;
  const n = (v: any) => (Array.isArray(v) ? v.length : 0);
  switch (actor) {
    case "clerk":
      if (!m) return "";
      return `${n(m.documents)} documents · ${n(m.products)} products · ${m.products?.reduce((a: number, p: any) => a + n(p.ingredients), 0) ?? 0} ingredients · ${n(m.certificates)} certificates`;
    case "investigator": {
      if (!mx) return "";
      const bad = (mx.rows ?? []).filter((r: any) => ["EXPIRED", "MISMATCH", "NO_CERT", "NEEDS_REVIEW"].includes(r.verdict)).length;
      return `${n(mx.rows)} ingredients traced · ${bad} flagged · ${n(mx.supplier_requests)} supplier drafts`;
    }
    case "process-builder":
      if (!pp) return "";
      return `${n(pp.flows)} process flows · ${n(pp.procedures)} SOP drafts · ${n(pp.missing_documents)} missing documents`;
    case "auditor": {
      if (!au) return "";
      const f = au.findings ?? [];
      const crit = f.filter((x: any) => x.severity === "CRITICAL").length;
      return `${au.verdict} · ${f.length} findings · ${crit} critical`;
    }
    default:
      return "";
  }
}

function Node({ actor, name, avatar, state }: { actor: Actor; name: string; avatar?: string; state: RunState }) {
  const { status, ms, label } = statusOf(state.steps, actor);
  const out = output(actor, state.data);
  const p = prov[actor];
  return (
    <div className={`fnode ${status}`}>
      <div className="fnode-head">
        {avatar && /* eslint-disable-next-line @next/next/no-img-element */ <img src={avatar} alt="" />}
        <div className="fnode-id">
          <div className="fnode-name">{name}</div>
          <span className={`chip ${status}`}>
            {status === "running" && <span className="spin" aria-hidden="true" />}
            {status === "done" ? `done ${(ms / 1000).toFixed(1)}s` : status === "running" ? "working" : status === "failed" ? "failed" : "waiting"}
          </span>
        </div>
      </div>
      <div className="fnode-out">{out || (status === "running" ? label : "—")}</div>
      {p && (
        <div className="fnode-prov" title={`${p.file} · ${p.skills.join(", ")}`}>
          {p.file.replace("agents/", "")} · {p.chars.toLocaleString()} chars
        </div>
      )}
    </div>
  );
}

export default function AgentFlow({ state }: { state: RunState }) {
  const vs = statusOf(state.steps, "validator");
  const repairSteps = state.steps.filter((s) => s.group.startsWith("Phase 4"));
  const repairActive = repairSteps.some((s) => s.status === "running");
  const rounds = state.repairLog?.rounds.length ?? 0;
  const repairOn = repairActive || rounds > 0 || repairSteps.length > 0;
  const round = repairSteps.length ? Number(repairSteps[repairSteps.length - 1].group.match(/round (\d+)/)?.[1] ?? rounds) : rounds;

  return (
    <div className="card flowcard">
      <div className="flow-banner">
        These are the five agents of the <strong>HalalPilot WorkBuddy expert team</strong>. Their instructions are copied from the plugin at build
        time — the file names and sizes below are the real ones.
      </div>

      <div className="flow">
        <Node {...NODES[0]} state={state} />

        <div className="rail fork" aria-hidden="true">
          <span className="rail-tag">parallel</span>
        </div>

        <div className="flow-stack">
          <Node {...NODES[1]} state={state} />
          <Node {...NODES[2]} state={state} />
        </div>

        <div className="rail join" aria-hidden="true" />

        <div className="flow-stack">
          <Node {...NODES[3]} state={state} />
          <div className={`fnode validator ${vs.status}`}>
            <div className="fnode-head">
              <div className="badge-ico" aria-hidden="true">
                ✓
              </div>
              <div className="fnode-id">
                <div className="fnode-name">validate_pack</div>
                <span className={`chip ${vs.status}`}>{vs.status === "done" ? "done" : vs.status === "running" ? "checking" : "waiting"}</span>
              </div>
            </div>
            <div className="fnode-out">
              {state.validation
                ? `${state.validation.errors.length} integrity errors · score ${state.validation.readiness?.score ?? "—"}/100`
                : "deterministic gate — no AI"}
            </div>
            <div className="fnode-prov">validate_pack.py, ported 1:1</div>
          </div>
        </div>
      </div>

      <div className={`repair-rail ${repairOn ? "on" : ""} ${repairActive ? "active" : ""}`}>
        <span className="repair-arrow" aria-hidden="true">
          ↰
        </span>
        <span className="repair-text">
          {repairActive
            ? `Repair round ${round} — failures routed back to the agent that owns the file`
            : rounds > 0
              ? `Repair loop ran ${rounds} round${rounds > 1 ? "s" : ""}, then stopped: ${state.repairLog?.stopped_because?.replace(/_/g, " ")}`
              : "Repair loop — findings route back to the owning agent, then re-validate"}
        </span>
      </div>
    </div>
  );
}
