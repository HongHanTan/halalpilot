"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import type { Actor, RunState, Step } from "@/lib/orchestrator";

/* The live agent pipeline: the five agents, the validator and the readiness pack as an animated graph.
 * Every node state, count, dot and caption is derived from the run's own steps and output files. */

type NodeId = "lead" | "clerk" | "investigator" | "builder" | "validator" | "auditor";
type NState = "idle" | "working" | "waiting" | "done" | "failed";
type Pt = [number, number];

const AGENTS: Record<NodeId, { name: string; short: string; avatar?: string }> = {
  lead: { name: "HalalPilot Lead", short: "Lead", avatar: "/avatars/halalpilot-team-lead.png" },
  clerk: { name: "Evidence Clerk", short: "Clerk", avatar: "/avatars/halalpilot-evidence-clerk.png" },
  investigator: { name: "Ingredient Investigator", short: "Investigator", avatar: "/avatars/halalpilot-ingredient-investigator.png" },
  builder: { name: "Process Builder", short: "Builder", avatar: "/avatars/halalpilot-process-builder.png" },
  auditor: { name: "Mock Auditor", short: "Auditor", avatar: "/avatars/halalpilot-mock-auditor.png" },
  validator: { name: "validate_pack", short: "Validator" },
};
const NODE_IDS: NodeId[] = ["lead", "clerk", "investigator", "builder", "validator", "auditor"];
const ACTOR_NODE: Record<Actor, NodeId> = {
  lead: "lead",
  clerk: "clerk",
  investigator: "investigator",
  "process-builder": "builder",
  auditor: "auditor",
  validator: "validator",
};
const PHASES = ["Intake", "Extract", "Build ∥", "Check ∥", "Repair", "Assemble"];

interface Layout {
  vb: [number, number];
  R: number;
  ar: number;
  PR: number;
  short: boolean;
  dot: number;
  sq: number;
  at: Record<string, Pt>;
  edges: Record<string, Pt[]>;
  loopLabel: [number, number, number];
  orchLabel: [number, number, number];
  packChip: Pt;
}

// Two hand-tuned layouts: wide (left → right) and tall (top → bottom, for phones).
const LAYOUTS: Record<"wide" | "tall", Layout> = {
  wide: {
    vb: [1200, 620], R: 44, ar: 36, PR: 54, short: false, dot: 14, sq: 13,
    at: {
      lead: [100, 290], clerk: [290, 290], fork: [400, 290], investigator: [565, 165], builder: [565, 420],
      junction: [725, 290], validator: [885, 165], auditor: [885, 420], pack: [1088, 290],
    },
    edges: {
      lead_clerk: [[144, 290], [246, 290]],
      clerk_fork: [[334, 290], [400, 290]],
      fork_inv: [[400, 290], [470, 290], [470, 165], [521, 165]],
      fork_bld: [[400, 290], [470, 290], [470, 420], [521, 420]],
      inv_j: [[609, 165], [675, 165], [675, 290], [713, 290]],
      bld_j: [[609, 420], [675, 420], [675, 290], [713, 290]],
      j_val: [[737, 290], [795, 290], [795, 165], [841, 165]],
      j_aud: [[737, 290], [795, 290], [795, 420], [841, 420]],
      val_pack: [[929, 165], [995, 165], [995, 290], [1034, 290]],
      aud_pack: [[929, 420], [995, 420], [995, 290], [1034, 290]],
      loop: [[885, 555], [885, 612], [565, 612], [565, 555]],
      orch: [[100, 246], [100, 40], [1088, 40], [1088, 236]],
    },
    loopLabel: [725, 580, 0], orchLabel: [594, 76, 0], packChip: [1150, 228],
  },
  tall: {
    vb: [400, 1050], R: 40, ar: 32, PR: 48, short: true, dot: 13, sq: 13,
    at: {
      lead: [200, 64], clerk: [200, 230], fork: [200, 336], investigator: [105, 420], builder: [295, 420],
      junction: [200, 585], validator: [105, 680], auditor: [295, 680], pack: [200, 880],
    },
    edges: {
      lead_clerk: [[200, 150], [200, 190]],
      clerk_fork: [[200, 318], [200, 336]],
      fork_inv: [[200, 336], [200, 362], [105, 352], [105, 380]],
      fork_bld: [[200, 336], [200, 362], [295, 352], [295, 380]],
      inv_j: [[105, 540], [105, 566], [200, 556], [200, 573]],
      bld_j: [[295, 530], [295, 566], [200, 556], [200, 573]],
      j_val: [[200, 597], [200, 620], [105, 612], [105, 640]],
      j_aud: [[200, 597], [200, 620], [295, 612], [295, 640]],
      val_pack: [[105, 768], [105, 805], [200, 795], [200, 832]],
      aud_pack: [[295, 792], [295, 812], [200, 802], [200, 832]],
      loop: [[338, 680], [394, 680], [394, 420], [338, 420]],
      orch: [[158, 64], [8, 64], [8, 880], [152, 880]],
    },
    loopLabel: [386, 550, -90], orchLabel: [22, 470, -90], packChip: [262, 838],
  },
};

const EDGE_ENDS: Record<string, [string, string]> = {
  lead_clerk: ["lead", "clerk"], clerk_fork: ["clerk", "fork"], fork_inv: ["fork", "investigator"], fork_bld: ["fork", "builder"],
  inv_j: ["investigator", "junction"], bld_j: ["builder", "junction"], j_val: ["junction", "validator"], j_aud: ["junction", "auditor"],
  val_pack: ["validator", "pack"], aud_pack: ["auditor", "pack"], loop: ["auditor", "builder"], orch: ["lead", "pack"],
};

const pathD = (p: Pt[]) =>
  p.length === 2
    ? `M ${p[0][0]} ${p[0][1]} L ${p[1][0]} ${p[1][1]}`
    : `M ${p[0][0]} ${p[0][1]} C ${p[1][0]} ${p[1][1]}, ${p[2][0]} ${p[2][1]}, ${p[3][0]} ${p[3][1]}`;

function pointAt(p: Pt[], t: number): Pt {
  if (p.length === 2) return [p[0][0] + (p[1][0] - p[0][0]) * t, p[0][1] + (p[1][1] - p[0][1]) * t];
  const u = 1 - t;
  const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [0, 1].map((ax) => k.reduce((sum, c, i) => sum + c * p[i][ax], 0)) as Pt;
}

const list = (v: any): any[] => (Array.isArray(v) ? v : []);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Latest step for an actor wins, so a repair round overrides the original build. */
function nodeState(steps: Step[], actor: Actor): NState {
  const mine = steps.filter((s) => s.actor === actor);
  if (!mine.length) return "idle";
  if (mine.some((s) => s.status === "running")) return "working";
  const last = mine[mine.length - 1];
  return last.status === "failed" ? "failed" : "done";
}

function phaseOf(group: string): number {
  const n = Number(group.match(/Phase (\d)/)?.[1]);
  return Number.isFinite(n) ? n : 0;
}

export default function AgentFlow({ state }: { state: RunState }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [layoutName, setLayoutName] = useState<"wide" | "tall">("wide");
  const [particles, setParticles] = useState<{ id: number; edge: string }[]>([]);
  const prev = useRef<Record<string, NState>>({});
  const pid = useRef(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => setLayoutName(el.clientWidth && el.clientWidth < 720 ? "tall" : "wide");
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const L = LAYOUTS[layoutName];
  const { steps, data, validation } = state;

  /* ---- derive every node's state from the steps ---- */
  const ns: Record<NodeId, NState> = {} as any;
  for (const a of Object.keys(ACTOR_NODE) as Actor[]) ns[ACTOR_NODE[a]] = nodeState(steps, a);
  const leadSteps = steps.filter((s) => s.actor === "lead");
  if (ns.lead !== "working" && ns.lead !== "failed" && steps.length) {
    const asm = leadSteps.find((s) => s.group.startsWith("Phase 5"));
    ns.lead = asm?.status === "done" ? "done" : "waiting";
  }
  const repairSteps = steps.filter((s) => s.group.startsWith("Phase 4"));
  const repairActive = repairSteps.some((s) => s.status === "running");
  const rounds = state.repairLog?.rounds.length ?? 0;
  const loopOn = repairActive || repairSteps.length > 0;
  const running = !state.done && steps.some((s) => s.status === "running");

  const forkState: NState =
    ns.investigator === "working" || ns.builder === "working" ? "working" : ns.investigator === "done" || ns.builder === "done" ? "done" : "idle";
  const junctionState: NState =
    ns.validator === "working" || ns.auditor === "working" ? "working" : ns.validator === "done" && ns.auditor === "done" ? "done" : "idle";
  const stateOfAny = (id: string): NState =>
    id === "fork" ? forkState : id === "junction" ? junctionState : id === "pack" ? (state.pack ? "done" : "idle") : ns[id as NodeId];

  const edgeState = (id: string): string => {
    if (id === "orch") return running ? "active" : ns.lead === "done" ? "done" : "idle";
    if (id === "loop") return repairActive ? "active" : loopOn ? "done" : "idle";
    const [, b] = EDGE_ENDS[id];
    const t = stateOfAny(b);
    return t === "working" ? "active" : t === "done" ? "done" : "idle";
  };

  /* ---- particles: a pulse travels down an edge when the node it feeds starts working ---- */
  const fireKey = NODE_IDS.map((n) => ns[n]).join() + forkState + junctionState;
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const now: Record<string, NState> = { ...ns, fork: forkState, junction: junctionState };
    const fire: string[] = [];
    for (const [edge, [a, b]] of Object.entries(EDGE_ENDS)) {
      if (edge === "orch") continue;
      if (now[b] === "working" && prev.current[b] !== "working") fire.push(edge);
      void a;
    }
    // A node that starts working has just received its input; the clerk's output also reaches the fork.
    if (now.clerk === "done" && prev.current.clerk !== "done") fire.push("clerk_fork");
    prev.current = now;
    if (!fire.length) return;
    const added = fire.map((edge) => ({ id: ++pid.current, edge }));
    setParticles((p) => [...p, ...added]);
    const t = setTimeout(() => setParticles((p) => p.filter((x) => !added.includes(x))), 1100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fireKey]);

  /* ---- numbers shown on the nodes ---- */
  const manifest: any = data.manifest;
  const matrix: any = data.matrix;
  const proc: any = data.process;
  const audit: any = data.audit;
  const rows = list(matrix?.rows);
  const sops = list(proc?.procedures).length;
  const missing = list(proc?.missing_documents).length;
  const findings = list(audit?.findings);
  const docs = list(manifest?.documents).length;

  const metric = (id: NodeId): string => {
    const st = ns[id];
    if (st === "idle") return "";
    switch (id) {
      case "lead":
        return st === "done" ? "pack assembled" : st === "working" ? "coordinating…" : "";
      case "clerk":
        return manifest ? `${docs} files read` : "reading…";
      case "investigator":
        return matrix ? `${rows.length} ingredients` : "tracing…";
      case "builder":
        return proc ? `${sops} SOPs · ${missing} missing docs` : "drafting…";
      case "validator":
        return validation ? `${validation.passed ? "PASS" : "FAIL"} · ${plural(validation.errors.length, "error")}` : "checking…";
      case "auditor":
        return audit ? plural(findings.length, "finding") : "auditing…";
    }
  };

  const score = validation?.readiness ?? null;

  const stepperState = (n: number): string => {
    const ph = steps.filter((s) => phaseOf(s.group) === n);
    if (!ph.length) return n < Math.max(-1, ...steps.map((s) => phaseOf(s.group))) ? "skipped" : "pending";
    return ph.some((s) => s.status === "running") ? "active" : "done";
  };

  const runningStep = steps.find((s) => s.status === "running");
  const caption = state.error
    ? state.error
    : state.done
      ? score
        ? `Done · readiness ${score.score}/100 · ${score.status.replace(/_/g, " ")}`
        : "Done"
      : runningStep
        ? `${AGENTS[ACTOR_NODE[runningStep.actor]].name}: ${runningStep.label}`
        : "Starting the team…";

  const chips: { label: string; edge: string | null; at: number; title: string }[] = [];
  if (steps.some((s) => s.actor === "lead" && s.status === "done")) chips.push({ label: "00", edge: "lead_clerk", at: 0.5, title: "00-plan.md" });
  if (manifest) chips.push({ label: "01", edge: "clerk_fork", at: 0.5, title: "01-case-manifest.json" });
  if (matrix) chips.push({ label: "02", edge: "inv_j", at: 0.72, title: "02-ingredient-matrix.json" });
  if (proc) chips.push({ label: "03", edge: "bld_j", at: 0.72, title: "03-process-pack.json" });
  if (validation) chips.push({ label: "VR", edge: "val_pack", at: 0.38, title: "validation-report.json" });
  if (audit) chips.push({ label: "04", edge: "aud_pack", at: 0.38, title: "04-audit-report.json" });
  if (state.repairLog) chips.push({ label: "05", edge: "loop", at: 0.5, title: "05-repair-log.json" });
  if (state.pack) chips.push({ label: "PACK", edge: null, at: 0, title: "READINESS-PACK.md" });

  const circ = (r: number) => 2 * Math.PI * r;
  const loopLabel = L.loopLabel;
  const orchLabel = L.orchLabel;

  return (
    <div className="card flowcard">
      <div className="stepper-row">
        <ol className="stepper" aria-label="Phases">
          {PHASES.map((label, n) => (
            <li key={label} data-state={n === 4 && !loopOn ? (state.done ? "skipped" : "pending") : stepperState(n)}>
              <span className="pn">{n}</span>
              {label}
            </li>
          ))}
        </ol>
      </div>

      <div className="graph-wrap" ref={wrapRef} data-layout={layoutName}>
        <svg
          className="graph"
          viewBox={`0 0 ${L.vb[0]} ${L.vb[1]}`}
          data-layout={layoutName}
          data-running={String(running)}
          role="group"
          aria-label="HalalPilot agents and the files they pass on"
          preserveAspectRatio="xMidYMid meet"
        >
          <g className="edges">
            {Object.entries(L.edges).map(([id, pts]) => (
              <path key={id} className={`edge${id === "loop" ? " loop" : ""}${id === "orch" ? " orch" : ""}`} d={pathD(pts)} data-state={edgeState(id)} />
            ))}
            <text className="edge-label loop-label" x={loopLabel[0]} y={loopLabel[1]} transform={loopLabel[2] ? `rotate(${loopLabel[2]} ${loopLabel[0]} ${loopLabel[1]})` : undefined}>
              repair loop · up to 3 rounds{rounds ? ` · ran ${rounds}` : ""}
            </text>
            <text className="edge-label orch-label" x={orchLabel[0]} y={orchLabel[1]} transform={orchLabel[2] ? `rotate(${orchLabel[2]} ${orchLabel[0]} ${orchLabel[1]})` : undefined}>
              every message goes through the Lead
            </text>
          </g>

          <g className="nodes">
            {NODE_IDS.map((id) => {
              const [x, y] = L.at[id];
              const { R, ar } = L;
              const st = ns[id];
              const a = AGENTS[id];
              const cid = `clip-${id}-${layoutName}`;
              const C = circ(R);
              return (
                <g key={id} className="node" data-node={id} data-agent={id} data-state={st} data-result={id === "validator" && validation ? (validation.passed ? "pass" : "fail") : undefined} transform={`translate(${x} ${y})`}>
                  <circle className="halo" r={R + 10} />
                  <circle className="track" r={R} />
                  <circle className="ring" r={R} />
                  {id === "clerk" && (
                    <circle className="progress" r={R} transform="rotate(-90)" strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * (manifest ? 0 : st === "working" ? 0.6 : 1)).toFixed(1)} />
                  )}
                  {a.avatar ? (
                    <>
                      <clipPath id={cid}>
                        <circle r={ar} />
                      </clipPath>
                      <image href={a.avatar} x={-ar} y={-ar} width={ar * 2} height={ar * 2} clipPath={`url(#${cid})`} preserveAspectRatio="xMidYMid slice" />
                    </>
                  ) : (
                    <>
                      <circle className="face" r={ar} />
                      <text className="glyph" dominantBaseline="central">
                        {validation ? (validation.passed ? "✓" : "✕") : "⚙"}
                      </text>
                    </>
                  )}
                  <g className="badge" transform={`translate(${(R * 0.72).toFixed(1)} ${(-R * 0.72).toFixed(1)})`}>
                    <circle r={10} />
                    <text dominantBaseline="central">✓</text>
                  </g>
                  <text className="label" y={R + 24}>
                    {L.short ? a.short : a.name}
                  </text>
                  <text className="metric" y={R + 43}>
                    {metric(id)}
                  </text>
                  <title>{a.name}</title>
                  <g className="viz" transform={`translate(0 ${R + 60})`}>
                    {id === "investigator" && matrix && <Dots rows={rows} step={L.dot} />}
                    {id === "builder" && proc && <Squares sops={sops} missing={missing} step={L.sq} />}
                    {id === "auditor" && audit && <Findings findings={findings} />}
                  </g>
                </g>
              );
            })}

            <g className="node junction" data-node="junction" data-state={junctionState} transform={`translate(${L.at.junction[0]} ${L.at.junction[1]})`}>
              <circle className="jdot" r={12} />
              <title>Files 01–03 go to the checkers as paths, never as summaries</title>
            </g>
            <g className="node" data-node="fork" data-state={forkState} transform={`translate(${L.at.fork[0]} ${L.at.fork[1]})`} />

            <g className="node pack" data-node="pack" data-status={score?.status ?? ""} transform={`translate(${L.at.pack[0]} ${L.at.pack[1]})`}>
              <circle className="halo" r={L.PR + 10} />
              <circle className="track" r={L.PR} />
              <circle
                className="score"
                r={L.PR}
                transform="rotate(-90)"
                strokeDasharray={circ(L.PR).toFixed(1)}
                strokeDashoffset={(circ(L.PR) * (1 - (score ? score.score / 100 : 0))).toFixed(1)}
              />
              <text className="score-num" y={-4} dominantBaseline="central">
                {score ? score.score : "–"}
              </text>
              <text className="score-of" y={20} dominantBaseline="central">
                /100
              </text>
              <text className="label" y={L.PR + 24}>
                Readiness pack
              </text>
              {score && (
                <g className="pill" transform={`translate(0 ${L.PR + 48})`}>
                  <rect x={-58} y={-12} width={116} height={24} rx={12} />
                  <text dominantBaseline="central">{score.status.replace(/_/g, " ")}</text>
                </g>
              )}
              <text className="metric" y={L.PR + 80}>
                {score ? plural(score.blockers.total, "blocker") : ""}
              </text>
              <title>READINESS-PACK.md: the score is computed by the validator, never by the model</title>
            </g>
          </g>

          <g className="chips">
            {chips.map((c) => {
              const [x, y] = c.edge ? pointAt(L.edges[c.edge], c.at) : L.packChip;
              const w = c.label.length > 2 ? 46 : 32;
              return (
                <g key={c.label} className="fchip" transform={`translate(${x} ${y})`}>
                  <rect x={-w / 2} y={-11} width={w} height={22} rx={11} />
                  <text dominantBaseline="central">{c.label}</text>
                  <title>{c.title}</title>
                </g>
              );
            })}
          </g>

          <g className="fx" aria-hidden="true">
            {particles.map((p) => (
              <circle key={p.id} className="particle" r={5}>
                <animateMotion dur="0.9s" fill="freeze" path={pathD(L.edges[p.edge])} />
              </circle>
            ))}
          </g>
        </svg>
      </div>

      <p className="caption-line" key={caption} aria-live="polite">
        {caption}
      </p>
    </div>
  );
}

function Dots({ rows, step }: { rows: any[]; step: number }) {
  const n = rows.length;
  const cols = Math.min(Math.max(n, 1), 9);
  return (
    <>
      {rows.map((r, i) => {
        const row = Math.floor(i / cols);
        const inRow = Math.min(cols, n - row * cols);
        const cx = ((i % cols) - (inRow - 1) / 2) * step;
        return (
          <circle key={i} className="dot" r={5} cx={cx} cy={row * step} data-v={r.verdict}>
            <title>{`${r.ingredient} · ${String(r.verdict).replace(/_/g, " ")}`}</title>
          </circle>
        );
      })}
    </>
  );
}

function Squares({ sops, missing, step }: { sops: number; missing: number; step: number }) {
  const total = sops + missing;
  return (
    <>
      {Array.from({ length: total }, (_, i) => (
        <rect key={i} className={`sq ${i < sops ? "sop" : "miss"} on`} width={9} height={9} rx={2} x={(i - (total - 1) / 2) * step - 4.5} y={-4.5} />
      ))}
    </>
  );
}

function Findings({ findings }: { findings: any[] }) {
  return (
    <>
      {findings.map((f, i) => (
        <circle key={i} className="fdot" r={6} cx={(i - (findings.length - 1) / 2) * 16} cy={0} data-s={f.severity}>
          <title>{`${f.id} · ${f.severity}`}</title>
        </circle>
      ))}
    </>
  );
}
