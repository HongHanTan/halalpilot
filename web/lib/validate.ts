// TypeScript port of halalpilot/skills/halal-readiness-pack/scripts/validate_pack.py.
// Same error codes, same `owner` routing, same score formula. Keep the two in sync (tests/parity.test.ts).
// Filesystem checks (DOC_NOT_FOUND, FILE_NOT_CATALOGUED) run against the uploaded file inventory.

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Part = "manifest" | "matrix" | "process" | "audit";

export const FILES: Record<Part, string> = {
  manifest: "01-case-manifest.json",
  matrix: "02-ingredient-matrix.json",
  process: "03-process-pack.json",
  audit: "04-audit-report.json",
};
export const OWNERS: Record<Part, string> = {
  manifest: "halalpilot-evidence-clerk",
  matrix: "halalpilot-ingredient-investigator",
  process: "halalpilot-process-builder",
  audit: "halalpilot-mock-auditor",
};
const TEAM = new Set([...Object.values(OWNERS), "halalpilot-team-lead", "owner"]);

const FACT_STATUSES = new Set(["EXTRACTED", "OBSERVED"]);
const DRAFT_STATUSES = new Set(["DRAFT_FOR_OWNER"]);
const NEEDS_REVIEW = "NEEDS_REVIEW";
const ALL_STATUSES = new Set([...FACT_STATUSES, ...DRAFT_STATUSES, NEEDS_REVIEW]);
const RISK_LEVELS = new Set(["LOW", "MEDIUM", "HIGH"]);
const VERDICTS = new Set(["VERIFIED", "EXPIRING", "EXPIRED", "MISMATCH", "NO_CERT", "LOW_RISK_NO_CERT", NEEDS_REVIEW]);
const CERT_VERDICTS = new Set(["VERIFIED", "EXPIRING", "EXPIRED", "MISMATCH"]);
const PROBLEM_VERDICTS = new Set(["EXPIRED", "MISMATCH", "NO_CERT", NEEDS_REVIEW]);
const SEVERITIES = new Set(["CRITICAL", "MAJOR", "MINOR"]);
const FINDING_STATUSES = new Set(["OPEN", "RESOLVED", "OWNER_ACTION"]);
const VERDICT_WEIGHT: Record<string, number> = { VERIFIED: 1.0, EXPIRING: 0.75, LOW_RISK_NO_CERT: 0.5 };
const BLOCKING_CHECKLIST_ITEMS = 10; // D01-D10 in document-checklist.md

// Mechanical floor for the risk screen: these must be HIGH whatever the agent thinks.
export const HIGH_RISK_RE = new RegExp(
  String.raw`gelatin|\be[\s-]?4[4-8]\d\b|\be[\s-]?(?:120|920|422)\b|emulsif|shortening|\blard\b|tallow|` +
    String.raw`flavou?r|perisa|essence|extract|rennet|enzyme|whey|l-cysteine|glycer|carmine|` +
    String.raw`\bwine\b|mirin|ang\s?ciu|\barak\b|\brum\b|collagen|stabili[sz]er`,
  "i",
);
const DOC_ID_RE = /^DOC-\d{3,}$/;

export interface ValidationError {
  code: string;
  file: string;
  pointer: string;
  message: string;
  owner: string;
}
export interface ValidationWarning {
  code: string;
  file: string;
  pointer: string;
  message: string;
}
export interface Readiness {
  status: "INVALID_PACK" | "NOT_READY" | "NEEDS_WORK" | "READY";
  score: number;
  components: { ingredients: number; process_steps: number; documents: number };
  verdict_counts: Record<string, number>;
  blockers: {
    total: number;
    ingredients: string[];
    blocking_missing_documents: number;
    open_critical_findings: string[];
  };
  formula: string;
}
export interface ValidationReport {
  passed: boolean;
  as_of?: string;
  expiry_warning_days?: number;
  errors: ValidationError[];
  errors_by_owner?: Record<string, number>;
  warnings: ValidationWarning[];
  readiness: Readiness | null;
}
export interface ValidateInput {
  manifest?: any;
  matrix?: any;
  process?: any;
  audit?: any;
  /** Relative paths (posix) of every file the owner uploaded. */
  inventory: string[];
  asOf?: string;
  warnDays?: number;
}

// ---------- helpers that keep Python semantics ----------

/** Python truthiness: None, False, 0, "", [] and {} are falsy. */
function truthy(v: any): boolean {
  if (v === null || v === undefined || v === false || v === 0 || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}
const isDict = (v: any): boolean => v !== null && typeof v === "object" && !Array.isArray(v);
const asList = (v: any): any[] => (Array.isArray(v) ? v : []);
const posix = (p: string): string => String(p).replace(/\\/g, "/").replace(/^\.\//, "");

/** Python's round(): half to even. */
function pyRound(x: number, nd = 0): number {
  const m = 10 ** nd;
  const y = x * m;
  const f = Math.floor(y);
  const diff = y - f;
  let r: number;
  if (Math.abs(diff - 0.5) < 1e-9) r = f % 2 === 0 ? f : f + 1;
  else r = Math.round(y);
  return r / m;
}

const DAY = 86_400_000;
/** Parse YYYY-MM-DD to a UTC day number, or null. */
function parseDate(value: any): number | null {
  if (typeof value !== "string") return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return Math.round(t / DAY);
}
const isoDay = (n: number): string => new Date(n * DAY).toISOString().slice(0, 10);
const todayDay = (): number => Math.floor(Date.now() / DAY);
const repr = (v: any): string => (v === null || v === undefined ? "None" : typeof v === "string" ? `'${v}'` : String(v));

class Report {
  errors: ValidationError[] = [];
  warnings: ValidationWarning[] = [];
  err(part: Part, pointer: string, code: string, message: string) {
    this.errors.push({ code, file: FILES[part], pointer, message, owner: OWNERS[part] });
  }
  warn(part: Part, pointer: string, code: string, message: string) {
    this.warnings.push({ code, file: FILES[part], pointer, message });
  }
}

function* walkFacts(node: any, pointer: string): Generator<[string, any]> {
  if (isDict(node)) {
    if ("status" in node) yield [pointer, node];
    for (const [k, v] of Object.entries(node)) yield* walkFacts(v, `${pointer}/${k}`);
  } else if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) yield* walkFacts(node[i], `${pointer}/${i}`);
  }
}

function checkFactRules(part: Part, data: any, docs: Record<string, any>, rep: Report) {
  for (const [ptr, item] of walkFacts(data, "")) {
    const status = item.status;
    if (!ALL_STATUSES.has(status)) continue;
    const src = item.source;
    if (FACT_STATUSES.has(status)) {
      if (!truthy(src)) rep.err(part, ptr, "FACT_WITHOUT_SOURCE", `status ${status} but no source doc_id`);
      else if (!(src in docs)) rep.err(part, ptr, "UNKNOWN_SOURCE", `source ${repr(src)} is not in the manifest documents`);
      else if (docs[src].readable === false)
        rep.err(part, ptr, "SOURCE_UNREADABLE", `fact extracted from ${src}, which the manifest marks unreadable`);
    } else if (status === NEEDS_REVIEW) {
      if (!String(item.reason ?? "").trim()) rep.err(part, ptr, "NEEDS_REVIEW_WITHOUT_REASON", "NEEDS_REVIEW must say what is missing");
      if (truthy(src) && !(src in docs)) rep.err(part, ptr, "UNKNOWN_SOURCE", `source ${repr(src)} is not in the manifest documents`);
    }
    for (const ref of asList(item.based_on)) {
      if (!(ref in docs)) rep.err(part, ptr, "UNKNOWN_SOURCE", `based_on ${repr(ref)} is not in the manifest documents`);
    }
  }
}

function uniqueIds(part: Part, items: any, key: string, rep: Report, where: string): Record<string, any> {
  const out: Record<string, any> = Object.create(null);
  asList(items).forEach((it, i) => {
    const ident = isDict(it) ? it[key] : null;
    if (!truthy(ident)) rep.err(part, `/${where}/${i}`, "MISSING_ID", `missing ${key}`);
    else if (ident in out) rep.err(part, `/${where}/${i}`, "DUPLICATE_ID", `duplicate ${key} ${repr(ident)}`);
    else out[ident] = it;
  });
  return out;
}

interface Ctx {
  docs: Record<string, any>;
  products: Record<string, any>;
  ingredients: Record<string, any>;
  suppliers: Record<string, any>;
  lines: Record<string, any>;
  certs: Record<string, any>;
}

function checkManifest(m: any, inventory: Set<string>, rep: Report): Ctx {
  if (m.schema !== "halalpilot/case-manifest@1")
    rep.err("manifest", "/schema", "BAD_SCHEMA", "schema must be 'halalpilot/case-manifest@1'");
  const docs = uniqueIds("manifest", m.documents, "doc_id", rep, "documents");
  Object.entries(docs).forEach(([did, d], i) => {
    if (!DOC_ID_RE.test(did)) rep.err("manifest", `/documents/${i}`, "BAD_DOC_ID", `${repr(did)} must look like DOC-001`);
    const rel = d.path;
    if (!truthy(rel) || !inventory.has(posix(rel)))
      rep.err("manifest", `/documents/${i}`, "DOC_NOT_FOUND", `${repr(rel)} does not exist in the case folder`);
    if (!("readable" in d)) rep.err("manifest", `/documents/${i}`, "READABLE_MISSING", "documents need readable: true|false");
  });

  // Coverage: the clerk must account for every file the owner dropped in.
  const listed = new Set(Object.values(docs).map((d: any) => posix(d.path ?? "")));
  for (const rel of [...inventory].sort()) {
    const name = rel.split("/").pop() ?? rel;
    if (name.startsWith(".")) continue;
    if (!listed.has(rel)) rep.err("manifest", "/documents", "FILE_NOT_CATALOGUED", `${rel} is in the case folder but not in documents`);
  }

  const products = uniqueIds("manifest", m.products, "product_id", rep, "products");
  const ingredients: Record<string, any> = Object.create(null);
  Object.values(products).forEach((p: any, pi) => {
    asList(p.ingredients).forEach((ing: any, ii) => {
      const iid = ing?.ingredient_id;
      if (!truthy(iid)) rep.err("manifest", `/products/${pi}/ingredients/${ii}`, "MISSING_ID", "missing ingredient_id");
      else if (iid in ingredients)
        rep.err("manifest", `/products/${pi}/ingredients/${ii}`, "DUPLICATE_ID", `duplicate ingredient_id ${repr(iid)}`);
      else ingredients[iid] = { ...ing, product_id: p.product_id };
    });
  });
  if (Object.keys(products).length === 0) rep.err("manifest", "/products", "NO_PRODUCTS", "no products extracted");

  const suppliers = uniqueIds("manifest", m.suppliers, "supplier_id", rep, "suppliers");
  const lines = uniqueIds("manifest", m.invoice_lines, "line_id", rep, "invoice_lines");
  Object.values(lines).forEach((ln: any, i) => {
    if (truthy(ln.supplier_id) && !(ln.supplier_id in suppliers))
      rep.err("manifest", `/invoice_lines/${i}`, "UNKNOWN_SUPPLIER", `supplier_id ${repr(ln.supplier_id)} not in suppliers`);
  });
  const certs = uniqueIds("manifest", m.certificates, "cert_id", rep, "certificates");
  Object.values(certs).forEach((c: any, i) => {
    if (c.status === "EXTRACTED" && parseDate(c.expiry_date) === null)
      rep.err("manifest", `/certificates/${i}`, "BAD_EXPIRY", "EXTRACTED certificate needs expiry_date as YYYY-MM-DD (else NEEDS_REVIEW)");
  });
  checkFactRules("manifest", m, docs, rep);
  return { docs, products, ingredients, suppliers, lines, certs };
}

function checkMatrix(mx: any, ctx: Ctx, asOf: number, warnDays: number, rep: Report): any[] {
  if (mx.schema !== "halalpilot/ingredient-matrix@1")
    rep.err("matrix", "/schema", "BAD_SCHEMA", "schema must be 'halalpilot/ingredient-matrix@1'");
  const rows = asList(mx.rows);
  const seen = new Set<string>();
  const horizon = asOf + warnDays;
  rows.forEach((r: any, i: number) => {
    const p = `/rows/${i}`;
    const iid = r?.ingredient_id;
    if (!(iid in ctx.ingredients)) {
      rep.err("matrix", p, "UNKNOWN_INGREDIENT", `ingredient_id ${repr(iid)} not in manifest`);
      return;
    }
    if (seen.has(iid)) rep.err("matrix", p, "DUPLICATE_ROW", `ingredient ${iid} has more than one row`);
    seen.add(iid);
    const name = ctx.ingredients[iid].name ?? "";
    const verdict = r.verdict;
    const risk = r.risk_level;
    if (!VERDICTS.has(verdict)) rep.err("matrix", p, "BAD_VERDICT", `verdict ${repr(verdict)} not in ${JSON.stringify([...VERDICTS].sort())}`);
    if (!RISK_LEVELS.has(risk)) rep.err("matrix", p, "BAD_RISK", `risk_level ${repr(risk)} not in ${JSON.stringify([...RISK_LEVELS].sort())}`);
    if (HIGH_RISK_RE.test(`${name} ${r.ingredient ?? ""}`) && risk !== "HIGH")
      rep.err("matrix", p, "RISK_UNDERSTATED", `${repr(name)} matches the high-risk screen but risk_level is ${risk}`);
    for (const ref of asList(r.evidence)) {
      if (!(ref in ctx.docs)) rep.err("matrix", p, "UNKNOWN_SOURCE", `evidence ${repr(ref)} not in manifest documents`);
    }
    if (verdict !== NEEDS_REVIEW && !truthy(r.evidence))
      rep.err("matrix", p, "NO_EVIDENCE", `verdict ${verdict} needs at least one evidence doc_id`);
    if (verdict === NEEDS_REVIEW && !String(r.reason ?? "").trim())
      rep.err("matrix", p, "NEEDS_REVIEW_WITHOUT_REASON", "NEEDS_REVIEW must say what is missing");
    if (truthy(r.supplier_id) && !(r.supplier_id in ctx.suppliers))
      rep.err("matrix", p, "UNKNOWN_SUPPLIER", `supplier_id ${repr(r.supplier_id)} not in manifest`);
    if (truthy(r.invoice_line_id) && !(r.invoice_line_id in ctx.lines))
      rep.err("matrix", p, "UNKNOWN_INVOICE_LINE", `invoice_line_id ${repr(r.invoice_line_id)} not in manifest`);
    if ((PROBLEM_VERDICTS.has(verdict) || verdict === "EXPIRING") && !truthy(r.actions))
      rep.err("matrix", p, "NO_ACTION", `verdict ${verdict} needs at least one action for the owner`);
    if (verdict === "LOW_RISK_NO_CERT" && risk !== "LOW")
      rep.err("matrix", p, "LOW_RISK_VERDICT_MISUSED", "LOW_RISK_NO_CERT is only allowed for LOW risk items");

    if (CERT_VERDICTS.has(verdict)) {
      const cid = r.cert_id;
      const cert = ctx.certs[cid];
      if (!cert) {
        rep.err("matrix", p, "UNKNOWN_CERT", `verdict ${verdict} requires a cert_id from the manifest, got ${repr(cid)}`);
        return;
      }
      const expiry = parseDate(cert.expiry_date);
      if (r.cert_expiry !== cert.expiry_date)
        rep.err("matrix", p, "EXPIRY_MISMATCH", `cert_expiry ${repr(r.cert_expiry)} differs from manifest ${repr(cert.expiry_date)}`);
      if ((verdict === "VERIFIED" || verdict === "EXPIRING" || verdict === "EXPIRED") && expiry === null) {
        rep.err("matrix", p, "EXPIRY_UNKNOWN", `${verdict} requires a readable expiry date in the manifest`);
        return;
      }
      if (verdict === "VERIFIED" && expiry! <= horizon)
        rep.err("matrix", p, "VERDICT_INCONSISTENT", `VERIFIED but certificate expires ${isoDay(expiry!)} (on/before ${isoDay(horizon)}); use EXPIRING or EXPIRED`);
      if (verdict === "EXPIRING" && !(asOf < expiry! && expiry! <= horizon))
        rep.err("matrix", p, "VERDICT_INCONSISTENT", `EXPIRING but expiry ${isoDay(expiry!)} is not within ${warnDays} days of ${isoDay(asOf)}`);
      if (verdict === "EXPIRED" && expiry! > asOf)
        rep.err("matrix", p, "VERDICT_INCONSISTENT", `EXPIRED but expiry ${isoDay(expiry!)} is after ${isoDay(asOf)}`);
      if (verdict === "VERIFIED" || verdict === "EXPIRING") {
        if (!truthy(r.supplier_id) || !truthy(r.invoice_line_id))
          rep.err("matrix", p, "UNTRACED_SUPPLIER", `${verdict} requires supplier_id and invoice_line_id`);
        if (cert.status !== "EXTRACTED")
          rep.err("matrix", p, "CERT_NOT_EXTRACTED", `${verdict} relies on a certificate marked ${cert.status}`);
      }
    }
  });
  for (const iid of Object.keys(ctx.ingredients)) {
    if (!seen.has(iid)) rep.err("matrix", "/rows", "INGREDIENT_NOT_COVERED", `manifest ingredient ${iid} has no matrix row`);
  }
  asList(mx.supplier_requests).forEach((req: any, i: number) => {
    if (truthy(req?.supplier_id) && !(req.supplier_id in ctx.suppliers))
      rep.err("matrix", `/supplier_requests/${i}`, "UNKNOWN_SUPPLIER", `supplier_id ${repr(req.supplier_id)} not in manifest`);
  });
  checkFactRules("matrix", mx, ctx.docs, rep);
  return rows;
}

interface ProcSummary {
  steps_total: number;
  steps_ok: number;
  blocking_missing: number;
  missing_total: number;
}

function checkProcess(pp: any, ctx: Ctx, rep: Report): ProcSummary {
  if (pp.schema !== "halalpilot/process-pack@1")
    rep.err("process", "/schema", "BAD_SCHEMA", "schema must be 'halalpilot/process-pack@1'");
  const flowList = asList(pp.flows);
  const flows = new Set(flowList.map((f: any) => f?.product_id));
  for (const pid of Object.keys(ctx.products)) {
    if (!flows.has(pid)) rep.err("process", "/flows", "FLOW_MISSING", `product ${pid} has no process flow`);
  }
  let stepsTotal = 0;
  let stepsOk = 0;
  flowList.forEach((f: any, fi: number) => {
    if (!(f?.product_id in ctx.products))
      rep.err("process", `/flows/${fi}`, "UNKNOWN_PRODUCT", `product_id ${repr(f?.product_id)} not in manifest`);
    const steps = asList(f?.steps);
    if (!steps.some((s: any) => truthy(s?.halal_control_point)))
      rep.err("process", `/flows/${fi}`, "NO_HALAL_CONTROL_POINT", "each flow needs at least one halal control point");
    steps.forEach((s: any, si: number) => {
      stepsTotal += 1;
      const st = s?.status;
      if (!(DRAFT_STATUSES.has(st) || st === NEEDS_REVIEW))
        rep.err("process", `/flows/${fi}/steps/${si}`, "BAD_STATUS", `step status ${repr(st)} must be DRAFT_FOR_OWNER or NEEDS_REVIEW`);
      else if (st !== NEEDS_REVIEW) stepsOk += 1;
    });
  });
  asList(pp.procedures).forEach((sop: any, i: number) => {
    if (!(DRAFT_STATUSES.has(sop?.status) || sop?.status === NEEDS_REVIEW))
      rep.err("process", `/procedures/${i}`, "BAD_STATUS", "procedures are DRAFT_FOR_OWNER or NEEDS_REVIEW, never presented as existing practice");
    if (!truthy(sop?.steps)) rep.err("process", `/procedures/${i}`, "EMPTY_PROCEDURE", "procedure has no steps");
  });
  const missing = asList(pp.missing_documents);
  missing.forEach((md: any, i: number) => {
    if (typeof md?.blocking !== "boolean") rep.err("process", `/missing_documents/${i}`, "BLOCKING_UNSET", "blocking must be true or false");
    if (md?.status !== NEEDS_REVIEW) rep.err("process", `/missing_documents/${i}`, "BAD_STATUS", "missing documents are always NEEDS_REVIEW");
  });
  checkFactRules("process", pp, ctx.docs, rep);
  return {
    steps_total: stepsTotal,
    steps_ok: stepsOk,
    blocking_missing: missing.filter((md: any) => md?.blocking === true).length,
    missing_total: missing.length,
  };
}

function checkAudit(au: any, ctx: Ctx, rep: Report): any[] {
  if (au.schema !== "halalpilot/audit-report@1")
    rep.err("audit", "/schema", "BAD_SCHEMA", "schema must be 'halalpilot/audit-report@1'");
  const findings = asList(au.findings);
  uniqueIds("audit", findings, "finding_id", rep, "findings");
  findings.forEach((f: any, i: number) => {
    const p = `/findings/${i}`;
    if (!SEVERITIES.has(f?.severity)) rep.err("audit", p, "BAD_SEVERITY", `severity ${repr(f?.severity)}`);
    if (!FINDING_STATUSES.has(f?.status))
      rep.err("audit", p, "BAD_FINDING_STATUS", `status ${repr(f?.status)} not in ${JSON.stringify([...FINDING_STATUSES].sort())}`);
    if (!TEAM.has(f?.owner)) rep.err("audit", p, "BAD_OWNER", `owner ${repr(f?.owner)} must be a team agent id or 'owner'`);
    if (typeof f?.fixable_by_team !== "boolean") rep.err("audit", p, "FIXABLE_UNSET", "fixable_by_team must be true or false");
    if (!truthy(f?.required_fix)) rep.err("audit", p, "NO_REQUIRED_FIX", "every finding states the fix");
    for (const ref of asList(f?.evidence)) {
      if (typeof ref === "string" && ref.startsWith("DOC-") && !(ref in ctx.docs))
        rep.err("audit", p, "UNKNOWN_SOURCE", `evidence ${repr(ref)} not in manifest documents`);
    }
  });
  const openCrit = findings.filter((f: any) => f?.severity === "CRITICAL" && f?.status === "OPEN");
  if (au.verdict === "PASS" && openCrit.length > 0)
    rep.err("audit", "/verdict", "PASS_WITH_OPEN_CRITICAL", "auditor verdict PASS while CRITICAL findings are OPEN");
  if (au.verdict !== "PASS" && au.verdict !== "FAIL") rep.err("audit", "/verdict", "BAD_VERDICT", "verdict must be PASS or FAIL");
  return findings;
}

function readiness(rows: any[], proc: ProcSummary, findings: any[], errors: number): Readiness {
  const n = rows.length || 1;
  const ing = rows.reduce((s, r) => s + (VERDICT_WEIGHT[r?.verdict] ?? 0), 0) / n;
  const prc = proc.steps_total ? proc.steps_ok / proc.steps_total : 0;
  const docs = Math.max(0, 1 - proc.blocking_missing / BLOCKING_CHECKLIST_ITEMS);
  const score = pyRound(100 * (0.6 * ing + 0.15 * prc + 0.25 * docs));
  const ingredientBlockers = rows
    .filter((r) => PROBLEM_VERDICTS.has(r?.verdict) && r?.risk_level !== "LOW")
    .map((r) => r.ingredient_id as string);
  const openCrit = findings
    .filter((f) => f?.severity === "CRITICAL" && (f?.status === "OPEN" || f?.status === "OWNER_ACTION"))
    .map((f) => f.finding_id as string);
  const blockers = ingredientBlockers.length + proc.blocking_missing + openCrit.length;
  let status: Readiness["status"];
  if (errors) status = "INVALID_PACK";
  else if (blockers) status = "NOT_READY";
  else if (score >= 85) status = "READY";
  else status = "NEEDS_WORK";
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r?.verdict] = (counts[r?.verdict] ?? 0) + 1;
  return {
    status,
    score,
    components: { ingredients: pyRound(ing, 3), process_steps: pyRound(prc, 3), documents: pyRound(docs, 3) },
    verdict_counts: counts,
    blockers: {
      total: blockers,
      ingredients: ingredientBlockers,
      blocking_missing_documents: proc.blocking_missing,
      open_critical_findings: openCrit,
    },
    formula:
      "100 * (0.6*ingredients + 0.15*process_steps + 0.25*documents); " +
      "ingredient weights VERIFIED=1, EXPIRING=0.75, LOW_RISK_NO_CERT=0.5, other=0; " +
      `documents = 1 - blocking_missing/${BLOCKING_CHECKLIST_ITEMS}`,
  };
}

export function validate(input: ValidateInput): ValidationReport {
  const rep = new Report();
  const warnDays = input.warnDays ?? 90;
  const data: Partial<Record<Part, any>> = {};
  (Object.keys(FILES) as Part[]).forEach((part) => {
    const v = input[part];
    if (v === undefined || v === null) {
      if (part !== "audit") rep.err(part, "", "FILE_MISSING", `${FILES[part]} not found`);
      return;
    }
    if (!isDict(v)) {
      rep.err(part, "", "BAD_JSON", `${FILES[part]}: top level must be a JSON object`);
      return;
    }
    data[part] = v;
  });

  if (!data.manifest) return { passed: false, errors: rep.errors, warnings: rep.warnings, readiness: null };

  const m = data.manifest;
  let asOf = parseDate(input.asOf) ?? parseDate(m.as_of);
  if (asOf === null) {
    rep.err("manifest", "/as_of", "BAD_AS_OF", "as_of must be YYYY-MM-DD");
    asOf = todayDay();
  }
  const ctx = checkManifest(m, new Set(input.inventory.map(posix)), rep);
  const rows = data.matrix ? checkMatrix(data.matrix, ctx, asOf, warnDays, rep) : [];
  const proc: ProcSummary = data.process
    ? checkProcess(data.process, ctx, rep)
    : { steps_total: 0, steps_ok: 0, blocking_missing: BLOCKING_CHECKLIST_ITEMS, missing_total: 0 };
  const findings = data.audit ? checkAudit(data.audit, ctx, rep) : [];
  if (!data.audit) rep.warn("audit", "", "NO_AUDIT", "no audit report yet; readiness ignores audit findings");

  const byOwner: Record<string, number> = {};
  for (const o of [...new Set(Object.values(OWNERS))].sort()) byOwner[o] = rep.errors.filter((e) => e.owner === o).length;
  return {
    passed: rep.errors.length === 0,
    as_of: isoDay(asOf),
    expiry_warning_days: warnDays,
    errors: rep.errors,
    errors_by_owner: byOwner,
    warnings: rep.warnings,
    readiness: readiness(rows, proc, findings, rep.errors.length),
  };
}
