"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { topActions } from "@/lib/pack";
import type { RunState } from "@/lib/orchestrator";
import EvidenceChain from "./EvidenceChain";

function download(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function ScoreRing({ score, status }: { score: number; status: string }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = status === "READY" ? "var(--ok)" : status === "NEEDS_WORK" ? "var(--warn)" : "var(--bad)";
  return (
    <svg className="ring" viewBox="0 0 132 132" role="img" aria-label={`Readiness score ${score} out of 100`}>
      <circle cx="66" cy="66" r={r} fill="none" stroke="var(--border)" strokeWidth="12" />
      <circle
        cx="66"
        cy="66"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform="rotate(-90 66 66)"
      />
      <text x="66" y="62" textAnchor="middle" fontSize="30" fontWeight="700">
        {score}
      </text>
      <text x="66" y="84" textAnchor="middle" fontSize="12" fill="var(--muted)">
        / 100
      </text>
    </svg>
  );
}

export default function Results({ state }: { state: RunState }) {
  const v = state.validation;
  const rd = v?.readiness;
  const m: any = state.data.manifest;
  const matrix: any = state.data.matrix;
  const proc: any = state.data.process;
  const audit: any = state.data.audit;
  if (!m || !rd) return null;

  const suppliers: any[] = m.suppliers ?? [];
  const sName = (id?: string) => suppliers.find((s) => s.supplier_id === id)?.name ?? "—";
  const rows: any[] = matrix?.rows ?? [];
  const findings: any[] = audit?.findings ?? [];
  const openCount = findings.filter((f) => f.status === "OPEN").length;
  const todo = topActions(
    { manifest: m, matrix, process: proc, audit, validation: v!, repairRounds: state.repairLog?.rounds.length ?? 0, auditAvailable: state.auditAvailable },
    6,
  );
  const caseId = m.case_id || "case";

  return (
    <>
      <div className="card">
        <h2>Readiness pack</h2>
        <p className="sub">
          Status and score come from the validator, not from any agent. {v?.passed ? "0 integrity errors." : `${v?.errors.length} integrity errors.`}
        </p>
        <div className="summary">
          <ScoreRing score={rd.score} status={rd.status} />
          <div className="stats">
            <div className="stat">
              <div className="k">Status</div>
              <div className="v">
                <span className={`status ${rd.status}`}>{rd.status.replace("_", " ")}</span>
              </div>
            </div>
            <div className="stat">
              <div className="k">Blockers</div>
              <div className="v">{rd.blockers.total}</div>
            </div>
            <div className="stat">
              <div className="k">Mock audit</div>
              <div className="v">{state.auditAvailable ? `${audit?.verdict ?? "—"} · ${openCount} open` : "—"}</div>
            </div>
            <div className="stat">
              <div className="k">Repair rounds</div>
              <div className="v">{state.repairLog?.rounds.length ?? 0}</div>
            </div>
            <div className="stat">
              <div className="k">Documents read</div>
              <div className="v">{(m.documents ?? []).length}</div>
            </div>
            <div className="stat">
              <div className="k">Ingredients traced</div>
              <div className="v">{rows.length}</div>
            </div>
          </div>
        </div>

        {todo.length > 0 && (
          <>
            <h3 className="section-title">Do these first</h3>
            <ol className="todo">
              {todo.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ol>
          </>
        )}

        <div className="row" style={{ marginTop: 18 }}>
          {state.pack && (
            <button className="btn primary" onClick={() => download(`READINESS-PACK-${caseId}.md`, state.pack!, "text/markdown")}>
              Download READINESS-PACK.md
            </button>
          )}
          <button
            className="btn"
            onClick={() => {
              const bundle = {
                "01-case-manifest.json": m,
                "02-ingredient-matrix.json": matrix ?? null,
                "03-process-pack.json": proc ?? null,
                "04-audit-report.json": audit ?? null,
                "05-repair-log.json": state.repairLog,
                "validation-report.json": v,
              };
              download(`halalpilot-output-${caseId}.json`, JSON.stringify(bundle, null, 2));
            }}
          >
            Download all JSON outputs
          </button>
        </div>
      </div>

      <EvidenceChain manifest={m} matrix={matrix} />

      {rows.length > 0 && (
        <div className="card">
          {(matrix?.supplier_requests ?? []).length > 0 && (
            <details>
              <summary>Draft messages to suppliers ({matrix.supplier_requests.length})</summary>
              {matrix.supplier_requests.map((q: any) => (
                <div key={q.request_id}>
                  <div style={{ marginTop: 8, fontWeight: 600 }}>
                    {q.request_id} — {sName(q.supplier_id)}
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {q.reason}
                  </div>
                  <div className="draft">{q.draft_message}</div>
                </div>
              ))}
            </details>
          )}
        </div>
      )}

      {state.auditAvailable && findings.length > 0 && (
        <div className="card">
          <h2>Mock audit</h2>
          <p className="sub">
            An independent agent attacked the pack as a strict auditor would. Verdict <strong>{audit?.verdict}</strong>.
          </p>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Severity</th>
                  <th>Issue</th>
                  <th>Required fix</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {findings.map((f) => (
                  <tr key={f.finding_id}>
                    <td className="mono">{f.finding_id}</td>
                    <td>
                      <span className={`v-chip sev-${f.severity}`}>{f.severity}</span>
                    </td>
                    <td>{f.issue}</td>
                    <td className="muted">{f.required_fix}</td>
                    <td>
                      <span className={`v-chip f-${f.status}`}>{f.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(proc?.missing_documents ?? []).length > 0 && (
        <div className="card">
          <h2>Missing documents</h2>
          <p className="sub">Checked against the standard application checklist. Blocking items stop the pack from reaching READY.</p>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Document</th>
                  <th>Why</th>
                  <th>What you do</th>
                  <th>Blocking</th>
                </tr>
              </thead>
              <tbody>
                {proc.missing_documents.map((d: any) => (
                  <tr key={d.md_id}>
                    <td className="mono">{d.md_id}</td>
                    <td>{d.document}</td>
                    <td className="muted">{d.reason}</td>
                    <td>{d.owner_action}</td>
                    <td>{d.blocking ? <span className="v-chip sev-MAJOR">yes</span> : <span className="muted">no</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {proc?.halal_policy_draft?.text && (
            <details>
              <summary>Halal policy draft (for the owner to sign)</summary>
              <div className="draft">{proc.halal_policy_draft.text}</div>
            </details>
          )}
          {(proc?.procedures ?? []).length > 0 && (
            <details>
              <summary>SOP drafts ({proc.procedures.length})</summary>
              {proc.procedures.map((s: any) => (
                <div key={s.sop_id} style={{ marginTop: 10 }}>
                  <strong>
                    {s.sop_id} — {s.title}
                  </strong>
                  <ol className="todo">
                    {(s.steps ?? []).map((x: string, i: number) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </details>
          )}
        </div>
      )}

      {v && v.errors.length > 0 && (
        <div className="card">
          <h2>Validator errors still open</h2>
          <p className="sub">The pack is internally inconsistent. These are routed to the agent that owns the file.</p>
          <ul className="todo">
            {v.errors.slice(0, 20).map((e, i) => (
              <li key={i} className="mono">
                [{e.code}] {e.file}
                {e.pointer} → {e.owner}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
