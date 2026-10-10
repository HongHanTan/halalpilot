// Deterministic READINESS-PACK.md builder. Every value comes from the JSON files; status and score from the validator.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ValidationReport } from "./validate";

export interface PackInput {
  manifest: any;
  matrix?: any;
  process?: any;
  audit?: any;
  validation: ValidationReport;
  repairRounds: number;
  auditAvailable: boolean;
}

const cell = (v: unknown): string =>
  String(v ?? "—")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");

function* needsReview(node: any, file: string, pointer: string): Generator<{ file: string; pointer: string; reason: string }> {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) yield* needsReview(node[i], file, `${pointer}/${i}`);
  } else if (node && typeof node === "object") {
    const hit = node.status === "NEEDS_REVIEW" || node.verdict === "NEEDS_REVIEW";
    if (hit) yield { file, pointer, reason: String(node.reason ?? "no reason given") };
    for (const [k, v] of Object.entries(node)) yield* needsReview(v, file, `${pointer}/${k}`);
  }
}

export function topActions(p: PackInput, max = 5): string[] {
  const out: string[] = [];
  const rows: any[] = p.matrix?.rows ?? [];
  const nameOf = (id: string) => rows.find((r) => r.ingredient_id === id)?.ingredient ?? id;
  for (const id of p.validation.readiness?.blockers.ingredients ?? []) {
    const r = rows.find((x) => x.ingredient_id === id);
    out.push(`${nameOf(id)} (${r?.verdict ?? "?"}): ${r?.actions?.[0] ?? r?.reason ?? "resolve certificate"}`);
  }
  for (const md of p.process?.missing_documents ?? []) if (md.blocking) out.push(`${md.document}: ${md.owner_action}`);
  for (const f of p.audit?.findings ?? [])
    if (f.severity === "CRITICAL" && (f.status === "OPEN" || f.status === "OWNER_ACTION")) out.push(`${f.issue} → ${f.required_fix}`);
  return [...new Set(out)].slice(0, max);
}

export function buildReadinessPack(p: PackInput): string {
  const m = p.manifest;
  const v = p.validation;
  const rd = v.readiness;
  const docs: any[] = m.documents ?? [];
  const suppliers: any[] = m.suppliers ?? [];
  const certs: any[] = m.certificates ?? [];
  const products: any[] = m.products ?? [];
  const supplierName = (id?: string) => suppliers.find((s) => s.supplier_id === id)?.name;
  const cert = (id?: string) => certs.find((c) => c.cert_id === id);
  const productName = (id?: string) => products.find((x) => x.product_id === id)?.name;
  const ref = (ids?: string[]) => (ids?.length ? ids.map((d) => `[${d}]`).join(" ") : "—");
  const L: string[] = [];

  L.push(`# Halal Certification Readiness Pack — ${m.business?.name?.value ?? m.case_id ?? "Business"}`, "");
  L.push(
    `> Prepared by HalalPilot on ${m.as_of}. This is a **preparation pack**, not a certificate. It must be`,
    `> checked against the current requirements of the certifying authority before submission.`,
    `> Items marked **NEEDS_REVIEW** are gaps HalalPilot could not fill from your documents. It did not guess them.`,
    "",
  );

  L.push("## 1. Readiness at a glance", "", "| | |", "|---|---|");
  L.push(`| Status | **${rd?.status ?? "INVALID_PACK"}** |`);
  L.push(`| Readiness score | **${rd?.score ?? 0} / 100** (computed by the validator, formula in Appendix C) |`);
  L.push(`| Blockers | ${rd?.blockers.total ?? "—"} |`);
  L.push(`| Pack validation | ${v.passed ? "PASS" : "FAIL"}: ${v.errors.length} integrity errors |`);
  L.push(
    `| Mock audit | ${p.auditAvailable ? `${p.audit?.verdict ?? "—"} after ${p.repairRounds} repair round(s)` : "not available in this run"} |`,
    "",
  );
  const top = topActions(p);
  L.push("**Do these first** (blocking, in order):");
  if (top.length) top.forEach((t, i) => L.push(`${i + 1}. ${t}`));
  else L.push("1. No blocking actions found.");
  L.push("");

  L.push("## 2. Ingredient X-ray", "");
  L.push("| Product | Ingredient | Risk | Supplier | Certificate | Expiry | Verdict | Evidence |", "|---|---|---|---|---|---|---|---|");
  for (const r of p.matrix?.rows ?? []) {
    const c = cert(r.cert_id);
    L.push(
      `| ${cell(productName(r.product_id) ?? r.product_id)} | ${cell(r.ingredient)} | ${cell(r.risk_level)} | ${cell(
        supplierName(r.supplier_id) ?? "NEEDS_REVIEW",
      )} | ${cell(c?.certificate_no)} | ${cell(r.cert_expiry)} | ${cell(r.verdict)} | ${ref(r.evidence)} |`,
    );
  }
  L.push("", "### Messages to suppliers (drafts — review before sending)", "");
  const reqs: any[] = p.matrix?.supplier_requests ?? [];
  if (!reqs.length) L.push("_None needed._");
  for (const q of reqs) {
    L.push(`**${q.request_id} — ${supplierName(q.supplier_id) ?? q.supplier_id}** (${q.reason})`, "", `> ${String(q.draft_message ?? "").replace(/\n/g, "\n> ")}`, "");
  }
  const subs: any[] = p.matrix?.substitute_suggestions ?? [];
  if (subs.length) {
    L.push("### Substitute guidance (generic — no supplier is named as certified)", "");
    for (const s of subs) L.push(`- ${s.ingredient_id}: ${s.suggestion} _(NEEDS_REVIEW: ${s.reason})_`);
    L.push("");
  }

  L.push("## 3. Process flows (DRAFT_FOR_OWNER)", "");
  for (const f of p.process?.flows ?? []) {
    L.push(`**${productName(f.product_id) ?? f.product_id}**`, "");
    for (const s of f.steps ?? [])
      L.push(`${s.step_no}. ${s.halal_control_point ? "★ " : ""}**${s.name}** — ${s.description}${s.status === "NEEDS_REVIEW" ? ` _(NEEDS_REVIEW: ${s.reason})_` : ""} ${ref(s.based_on)}`);
    L.push("");
  }

  L.push("## 4. Procedures (DRAFT_FOR_OWNER)", "");
  for (const s of p.process?.procedures ?? []) {
    L.push(`### ${s.sop_id} — ${s.title}`, "", `_${s.purpose ?? ""}_`, "");
    (s.steps ?? []).forEach((x: string, i: number) => L.push(`${i + 1}. ${x}`));
    if (s.records?.length) L.push("", `Records to keep: ${s.records.join(", ")}`);
    L.push("");
  }

  L.push("## 5. Halal policy (draft for owner signature)", "", String(p.process?.halal_policy_draft?.text ?? "_Not drafted._"), "");

  L.push("## 6. Missing documents checklist", "", "| # | Document | Why | What you need to do | Blocking |", "|---|---|---|---|---|");
  for (const md of p.process?.missing_documents ?? [])
    L.push(`| ${cell(md.md_id)} | ${cell(md.document)} | ${cell(md.reason)} | ${cell(md.owner_action)} | ${md.blocking ? "yes" : "no"} |`);
  L.push("");

  L.push("## 7. Mock audit result", "");
  if (!p.auditAvailable) L.push("_The audit step did not complete in this run._", "");
  else {
    L.push("| ID | Severity | Issue | Status |", "|---|---|---|---|");
    for (const f of p.audit?.findings ?? []) L.push(`| ${cell(f.finding_id)} | ${cell(f.severity)} | ${cell(f.issue)} | ${cell(f.status)} |`);
    L.push("");
  }

  L.push("## Appendix A — Evidence register", "", "| doc_id | path | type | readable |", "|---|---|---|---|");
  for (const d of docs) L.push(`| ${cell(d.doc_id)} | ${cell(d.path)} | ${cell(d.type)} | ${d.readable === false ? "no" : "yes"} |`);
  L.push("");

  L.push("## Appendix B — Everything marked NEEDS_REVIEW", "");
  const nr = [
    ...needsReview(p.manifest, "01-case-manifest.json", ""),
    ...needsReview(p.matrix, "02-ingredient-matrix.json", ""),
    ...needsReview(p.process, "03-process-pack.json", ""),
  ];
  if (!nr.length) L.push("_None._");
  for (const x of nr) L.push(`- \`${x.file}#${x.pointer}\` — ${x.reason}`);
  L.push("");

  L.push("## Appendix C — How the score is computed", "", rd?.formula ?? "n/a", "");
  return L.join("\n");
}
