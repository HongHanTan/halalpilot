"use client";
import { AGENT_META } from "@/lib/types";
import type { Actor, Step } from "@/lib/orchestrator";

const AVATAR: Partial<Record<Actor, string>> = {
  clerk: "/avatars/halalpilot-evidence-clerk.png",
  investigator: "/avatars/halalpilot-ingredient-investigator.png",
  "process-builder": "/avatars/halalpilot-process-builder.png",
  auditor: "/avatars/halalpilot-mock-auditor.png",
  lead: "/avatars/halalpilot-team-lead.png",
};
const NAME: Record<Actor, string> = {
  clerk: AGENT_META.clerk.name,
  investigator: AGENT_META.investigator.name,
  "process-builder": AGENT_META["process-builder"].name,
  auditor: AGENT_META.auditor.name,
  lead: "HalalPilot Lead",
  validator: "validate_pack",
};

function secs(ms?: number) {
  return ms === undefined ? "" : `${(ms / 1000).toFixed(1)}s`;
}

function StepRow({ s }: { s: Step }) {
  const avatar = AVATAR[s.actor];
  return (
    <div className={`step ${s.status}`}>
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt="" />
      ) : (
        <div className="badge-ico" aria-hidden="true">
          ✓
        </div>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="head">
          <span className="who">{NAME[s.actor]}</span>
          <span className={`chip ${s.status}`}>
            {s.status === "running" && <span className="spin" aria-hidden="true" />}
            {s.status === "done" ? `done ${secs(s.ms)}` : s.status === "failed" ? "failed" : s.status === "running" ? "working" : s.status}
          </span>
        </div>
        <div className="what">{s.label}</div>
        {s.note && <div className="note">{s.note}</div>}
      </div>
    </div>
  );
}

export default function Timeline({ steps }: { steps: Step[] }) {
  if (!steps.length) return null;
  const groups: { name: string; parallel: boolean; steps: Step[] }[] = [];
  for (const s of steps) {
    const last = groups[groups.length - 1];
    if (last && last.name === s.group) last.steps.push(s);
    else groups.push({ name: s.group, parallel: s.parallel, steps: [s] });
  }
  return (
    <div className="card">
      <h2>Agent team</h2>
      <p className="sub">
        The same five roles as the WorkBuddy expert team. Steps marked <em>parallel</em> run at the same time.
      </p>
      {groups.map((g, i) => (
        <div className="group" key={`${g.name}-${i}`}>
          <h3>
            {g.name.replace(/ \(parallel\)$/, "")}
            {g.parallel && g.steps.length > 1 && <span className="par">parallel</span>}
          </h3>
          <div className="lanes">
            {g.steps.map((s) => (
              <StepRow key={s.id} s={s} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
