#!/usr/bin/env python3
"""validate_pack.py — deterministic gate for a HalalPilot readiness pack.

Usage:
    python validate_pack.py <output-dir> [--case-dir DIR] [--as-of YYYY-MM-DD]
                            [--expiry-warning-days 90] [--out FILE] [--quiet]

<output-dir> holds the team's files:
    01-case-manifest.json      (Evidence Clerk)            required
    02-ingredient-matrix.json  (Ingredient Investigator)   required
    03-process-pack.json       (Process Builder)           required
    04-audit-report.json       (Mock Auditor)              optional

--case-dir defaults to the parent of <output-dir>. --as-of defaults to the manifest's as_of.

Writes <output-dir>/validation-report.json (or --out) and prints a summary.

Exit codes: 0 = pack is internally consistent (it may still be NOT_READY),
            1 = integrity errors that an agent must repair, 2 = usage / IO error.

Errors are pack defects (invented or inconsistent evidence, broken references, missing
coverage). Missing *business* evidence is not an error: it is NEEDS_REVIEW and lowers readiness.
Standard library only.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

FILES = {
    "manifest": "01-case-manifest.json",
    "matrix": "02-ingredient-matrix.json",
    "process": "03-process-pack.json",
    "audit": "04-audit-report.json",
}
OWNERS = {
    "manifest": "halalpilot-evidence-clerk",
    "matrix": "halalpilot-ingredient-investigator",
    "process": "halalpilot-process-builder",
    "audit": "halalpilot-mock-auditor",
}
TEAM = set(OWNERS.values()) | {"halalpilot-team-lead", "owner"}

FACT_STATUSES = {"EXTRACTED", "OBSERVED"}
DRAFT_STATUSES = {"DRAFT_FOR_OWNER"}
NEEDS_REVIEW = "NEEDS_REVIEW"
ALL_STATUSES = FACT_STATUSES | DRAFT_STATUSES | {NEEDS_REVIEW}
RISK_LEVELS = {"LOW", "MEDIUM", "HIGH"}
VERDICTS = {"VERIFIED", "EXPIRING", "EXPIRED", "MISMATCH", "NO_CERT", "LOW_RISK_NO_CERT", NEEDS_REVIEW}
CERT_VERDICTS = {"VERIFIED", "EXPIRING", "EXPIRED", "MISMATCH"}
PROBLEM_VERDICTS = {"EXPIRED", "MISMATCH", "NO_CERT", NEEDS_REVIEW}
SEVERITIES = {"CRITICAL", "MAJOR", "MINOR"}
FINDING_STATUSES = {"OPEN", "RESOLVED", "OWNER_ACTION"}
VERDICT_WEIGHT = {"VERIFIED": 1.0, "EXPIRING": 0.75, "LOW_RISK_NO_CERT": 0.5}
BLOCKING_CHECKLIST_ITEMS = 10  # D01–D10 in halal-evidence-protocol/references/document-checklist.md

# Mechanical floor for the risk screen: these must be HIGH whatever the agent thinks.
HIGH_RISK_RE = re.compile(
    r"gelatin|\be[\s-]?4[4-8]\d\b|\be[\s-]?(?:120|920|422)\b|emulsif|shortening|\blard\b|tallow|"
    r"flavou?r|perisa|essence|extract|rennet|enzyme|whey|l-cysteine|glycer|carmine|"
    r"\bwine\b|mirin|ang\s?ciu|\barak\b|\brum\b|collagen|stabili[sz]er",
    re.IGNORECASE,
)
DOC_ID_RE = re.compile(r"^DOC-\d{3,}$")


class Report:
    def __init__(self) -> None:
        self.errors: list[dict] = []
        self.warnings: list[dict] = []

    def err(self, part: str, pointer: str, code: str, message: str) -> None:
        self.errors.append({"code": code, "file": FILES[part], "pointer": pointer,
                            "message": message, "owner": OWNERS[part]})

    def warn(self, part: str, pointer: str, code: str, message: str) -> None:
        self.warnings.append({"code": code, "file": FILES[part], "pointer": pointer, "message": message})


def parse_date(value) -> dt.date | None:
    if not isinstance(value, str):
        return None
    try:
        return dt.date.fromisoformat(value)
    except ValueError:
        return None


def load(path: Path):
    with path.open("r", encoding="utf-8-sig") as f:
        return json.load(f)


def walk_facts(node, pointer: str):
    """Yield (pointer, dict) for every dict that carries a `status` field."""
    if isinstance(node, dict):
        if "status" in node:
            yield pointer, node
        for k, v in node.items():
            yield from walk_facts(v, f"{pointer}/{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk_facts(v, f"{pointer}/{i}")


def check_fact_rules(part: str, data, docs: dict, rep: Report) -> None:
    """Protocol §1: every asserted fact cites a known, readable document; NEEDS_REVIEW states why."""
    for ptr, item in walk_facts(data, ""):
        status = item.get("status")
        if status not in ALL_STATUSES:
            continue  # other vocabularies (verdicts, finding status) are checked per file
        src = item.get("source")
        if status in FACT_STATUSES:
            if not src:
                rep.err(part, ptr, "FACT_WITHOUT_SOURCE", f"status {status} but no source doc_id")
            elif src not in docs:
                rep.err(part, ptr, "UNKNOWN_SOURCE", f"source {src!r} is not in the manifest documents")
            elif docs[src].get("readable") is False:
                rep.err(part, ptr, "SOURCE_UNREADABLE",
                        f"fact extracted from {src}, which the manifest marks unreadable")
        elif status == NEEDS_REVIEW:
            if not str(item.get("reason") or "").strip():
                rep.err(part, ptr, "NEEDS_REVIEW_WITHOUT_REASON", "NEEDS_REVIEW must say what is missing")
            if src and src not in docs:
                rep.err(part, ptr, "UNKNOWN_SOURCE", f"source {src!r} is not in the manifest documents")
        for ref in item.get("based_on") or []:
            if ref not in docs:
                rep.err(part, ptr, "UNKNOWN_SOURCE", f"based_on {ref!r} is not in the manifest documents")


def unique_ids(part: str, items: list, key: str, rep: Report, where: str) -> dict:
    out: dict = {}
    for i, it in enumerate(items or []):
        ident = it.get(key) if isinstance(it, dict) else None
        if not ident:
            rep.err(part, f"/{where}/{i}", "MISSING_ID", f"missing {key}")
        elif ident in out:
            rep.err(part, f"/{where}/{i}", "DUPLICATE_ID", f"duplicate {key} {ident!r}")
        else:
            out[ident] = it
    return out


def check_manifest(m: dict, case_dir: Path, out_dir: Path, rep: Report) -> dict:
    if m.get("schema") != "halalpilot/case-manifest@1":
        rep.err("manifest", "/schema", "BAD_SCHEMA", "schema must be 'halalpilot/case-manifest@1'")
    docs = unique_ids("manifest", m.get("documents"), "doc_id", rep, "documents")
    for i, (did, d) in enumerate(docs.items()):
        if not DOC_ID_RE.match(did):
            rep.err("manifest", f"/documents/{i}", "BAD_DOC_ID", f"{did!r} must look like DOC-001")
        rel = d.get("path")
        if not rel or not (case_dir / rel).is_file():
            rep.err("manifest", f"/documents/{i}", "DOC_NOT_FOUND", f"{rel!r} does not exist in the case folder")
        if "readable" not in d:
            rep.err("manifest", f"/documents/{i}", "READABLE_MISSING", "documents need readable: true|false")

    # Coverage: the clerk must account for every file the owner dropped in.
    listed = {Path(d.get("path", "")).as_posix() for d in docs.values()}
    for f in sorted(case_dir.rglob("*")):
        if not f.is_file() or f.name.startswith("."):
            continue
        try:
            f.relative_to(out_dir)
            continue
        except ValueError:
            pass
        rel = f.relative_to(case_dir).as_posix()
        if rel not in listed:
            rep.err("manifest", "/documents", "FILE_NOT_CATALOGUED", f"{rel} is in the case folder but not in documents")

    products = unique_ids("manifest", m.get("products"), "product_id", rep, "products")
    ingredients: dict = {}
    for pi, p in enumerate(products.values()):
        for ii, ing in enumerate(p.get("ingredients") or []):
            iid = ing.get("ingredient_id")
            if not iid:
                rep.err("manifest", f"/products/{pi}/ingredients/{ii}", "MISSING_ID", "missing ingredient_id")
            elif iid in ingredients:
                rep.err("manifest", f"/products/{pi}/ingredients/{ii}", "DUPLICATE_ID", f"duplicate ingredient_id {iid!r}")
            else:
                ingredients[iid] = {**ing, "product_id": p.get("product_id")}
    if not products:
        rep.err("manifest", "/products", "NO_PRODUCTS", "no products extracted")

    suppliers = unique_ids("manifest", m.get("suppliers"), "supplier_id", rep, "suppliers")
    lines = unique_ids("manifest", m.get("invoice_lines"), "line_id", rep, "invoice_lines")
    for i, ln in enumerate(lines.values()):
        if ln.get("supplier_id") and ln["supplier_id"] not in suppliers:
            rep.err("manifest", f"/invoice_lines/{i}", "UNKNOWN_SUPPLIER", f"supplier_id {ln['supplier_id']!r} not in suppliers")
    certs = unique_ids("manifest", m.get("certificates"), "cert_id", rep, "certificates")
    for i, c in enumerate(certs.values()):
        if c.get("status") == "EXTRACTED" and not parse_date(c.get("expiry_date")):
            rep.err("manifest", f"/certificates/{i}", "BAD_EXPIRY",
                    "EXTRACTED certificate needs expiry_date as YYYY-MM-DD (else NEEDS_REVIEW)")
    check_fact_rules("manifest", m, docs, rep)
    return {"docs": docs, "products": products, "ingredients": ingredients,
            "suppliers": suppliers, "lines": lines, "certs": certs}


def check_matrix(mx: dict, ctx: dict, as_of: dt.date, warn_days: int, rep: Report) -> list:
    if mx.get("schema") != "halalpilot/ingredient-matrix@1":
        rep.err("matrix", "/schema", "BAD_SCHEMA", "schema must be 'halalpilot/ingredient-matrix@1'")
    rows = mx.get("rows") or []
    seen: set = set()
    horizon = as_of + dt.timedelta(days=warn_days)
    for i, r in enumerate(rows):
        p = f"/rows/{i}"
        iid = r.get("ingredient_id")
        if iid not in ctx["ingredients"]:
            rep.err("matrix", p, "UNKNOWN_INGREDIENT", f"ingredient_id {iid!r} not in manifest")
            continue
        if iid in seen:
            rep.err("matrix", p, "DUPLICATE_ROW", f"ingredient {iid} has more than one row")
        seen.add(iid)
        name = ctx["ingredients"][iid].get("name") or ""
        verdict, risk = r.get("verdict"), r.get("risk_level")
        if verdict not in VERDICTS:
            rep.err("matrix", p, "BAD_VERDICT", f"verdict {verdict!r} not in {sorted(VERDICTS)}")
        if risk not in RISK_LEVELS:
            rep.err("matrix", p, "BAD_RISK", f"risk_level {risk!r} not in {sorted(RISK_LEVELS)}")
        if HIGH_RISK_RE.search(f"{name} {r.get('ingredient', '')}") and risk != "HIGH":
            rep.err("matrix", p, "RISK_UNDERSTATED", f"{name!r} matches the high-risk screen but risk_level is {risk}")
        for ref in r.get("evidence") or []:
            if ref not in ctx["docs"]:
                rep.err("matrix", p, "UNKNOWN_SOURCE", f"evidence {ref!r} not in manifest documents")
        if verdict != NEEDS_REVIEW and not r.get("evidence"):
            rep.err("matrix", p, "NO_EVIDENCE", f"verdict {verdict} needs at least one evidence doc_id")
        if verdict == NEEDS_REVIEW and not str(r.get("reason") or "").strip():
            rep.err("matrix", p, "NEEDS_REVIEW_WITHOUT_REASON", "NEEDS_REVIEW must say what is missing")
        if r.get("supplier_id") and r["supplier_id"] not in ctx["suppliers"]:
            rep.err("matrix", p, "UNKNOWN_SUPPLIER", f"supplier_id {r['supplier_id']!r} not in manifest")
        if r.get("invoice_line_id") and r["invoice_line_id"] not in ctx["lines"]:
            rep.err("matrix", p, "UNKNOWN_INVOICE_LINE", f"invoice_line_id {r['invoice_line_id']!r} not in manifest")
        if verdict in PROBLEM_VERDICTS | {"EXPIRING"} and not r.get("actions"):
            rep.err("matrix", p, "NO_ACTION", f"verdict {verdict} needs at least one action for the owner")
        if verdict == "LOW_RISK_NO_CERT" and risk != "LOW":
            rep.err("matrix", p, "LOW_RISK_VERDICT_MISUSED", "LOW_RISK_NO_CERT is only allowed for LOW risk items")

        if verdict in CERT_VERDICTS:
            cid = r.get("cert_id")
            cert = ctx["certs"].get(cid)
            if not cert:
                rep.err("matrix", p, "UNKNOWN_CERT", f"verdict {verdict} requires a cert_id from the manifest, got {cid!r}")
                continue
            expiry = parse_date(cert.get("expiry_date"))
            if r.get("cert_expiry") != cert.get("expiry_date"):
                rep.err("matrix", p, "EXPIRY_MISMATCH",
                        f"cert_expiry {r.get('cert_expiry')!r} differs from manifest {cert.get('expiry_date')!r}")
            if verdict in {"VERIFIED", "EXPIRING", "EXPIRED"} and not expiry:
                rep.err("matrix", p, "EXPIRY_UNKNOWN", f"{verdict} requires a readable expiry date in the manifest")
                continue
            if verdict == "VERIFIED" and expiry <= horizon:
                rep.err("matrix", p, "VERDICT_INCONSISTENT",
                        f"VERIFIED but certificate expires {expiry} (on/before {horizon}); use EXPIRING or EXPIRED")
            if verdict == "EXPIRING" and not (as_of < expiry <= horizon):
                rep.err("matrix", p, "VERDICT_INCONSISTENT", f"EXPIRING but expiry {expiry} is not within {warn_days} days of {as_of}")
            if verdict == "EXPIRED" and expiry > as_of:
                rep.err("matrix", p, "VERDICT_INCONSISTENT", f"EXPIRED but expiry {expiry} is after {as_of}")
            if verdict in {"VERIFIED", "EXPIRING"}:
                if not r.get("supplier_id") or not r.get("invoice_line_id"):
                    rep.err("matrix", p, "UNTRACED_SUPPLIER", f"{verdict} requires supplier_id and invoice_line_id")
                if cert.get("status") != "EXTRACTED":
                    rep.err("matrix", p, "CERT_NOT_EXTRACTED", f"{verdict} relies on a certificate marked {cert.get('status')}")
    for iid in ctx["ingredients"]:
        if iid not in seen:
            rep.err("matrix", "/rows", "INGREDIENT_NOT_COVERED", f"manifest ingredient {iid} has no matrix row")
    for i, req in enumerate(mx.get("supplier_requests") or []):
        if req.get("supplier_id") and req["supplier_id"] not in ctx["suppliers"]:
            rep.err("matrix", f"/supplier_requests/{i}", "UNKNOWN_SUPPLIER", f"supplier_id {req['supplier_id']!r} not in manifest")
    check_fact_rules("matrix", mx, ctx["docs"], rep)
    return rows


def check_process(pp: dict, ctx: dict, rep: Report) -> dict:
    if pp.get("schema") != "halalpilot/process-pack@1":
        rep.err("process", "/schema", "BAD_SCHEMA", "schema must be 'halalpilot/process-pack@1'")
    flows = {f.get("product_id"): f for f in pp.get("flows") or []}
    for pid in ctx["products"]:
        if pid not in flows:
            rep.err("process", "/flows", "FLOW_MISSING", f"product {pid} has no process flow")
    steps_total = steps_ok = 0
    for fi, f in enumerate(pp.get("flows") or []):
        if f.get("product_id") not in ctx["products"]:
            rep.err("process", f"/flows/{fi}", "UNKNOWN_PRODUCT", f"product_id {f.get('product_id')!r} not in manifest")
        steps = f.get("steps") or []
        if not any(s.get("halal_control_point") for s in steps):
            rep.err("process", f"/flows/{fi}", "NO_HALAL_CONTROL_POINT", "each flow needs at least one halal control point")
        for si, s in enumerate(steps):
            steps_total += 1
            st = s.get("status")
            if st not in DRAFT_STATUSES | {NEEDS_REVIEW}:
                rep.err("process", f"/flows/{fi}/steps/{si}", "BAD_STATUS", f"step status {st!r} must be DRAFT_FOR_OWNER or NEEDS_REVIEW")
            elif st != NEEDS_REVIEW:
                steps_ok += 1
    for i, sop in enumerate(pp.get("procedures") or []):
        if sop.get("status") not in DRAFT_STATUSES | {NEEDS_REVIEW}:
            rep.err("process", f"/procedures/{i}", "BAD_STATUS", "procedures are DRAFT_FOR_OWNER or NEEDS_REVIEW, never presented as existing practice")
        if not sop.get("steps"):
            rep.err("process", f"/procedures/{i}", "EMPTY_PROCEDURE", "procedure has no steps")
    missing = pp.get("missing_documents") or []
    for i, md in enumerate(missing):
        if not isinstance(md.get("blocking"), bool):
            rep.err("process", f"/missing_documents/{i}", "BLOCKING_UNSET", "blocking must be true or false")
        if md.get("status") != NEEDS_REVIEW:
            rep.err("process", f"/missing_documents/{i}", "BAD_STATUS", "missing documents are always NEEDS_REVIEW")
    check_fact_rules("process", pp, ctx["docs"], rep)
    return {"steps_total": steps_total, "steps_ok": steps_ok,
            "blocking_missing": sum(1 for md in missing if md.get("blocking") is True),
            "missing_total": len(missing)}


def check_audit(au: dict, ctx: dict, rep: Report) -> list:
    if au.get("schema") != "halalpilot/audit-report@1":
        rep.err("audit", "/schema", "BAD_SCHEMA", "schema must be 'halalpilot/audit-report@1'")
    findings = au.get("findings") or []
    unique_ids("audit", findings, "finding_id", rep, "findings")
    for i, f in enumerate(findings):
        p = f"/findings/{i}"
        if f.get("severity") not in SEVERITIES:
            rep.err("audit", p, "BAD_SEVERITY", f"severity {f.get('severity')!r}")
        if f.get("status") not in FINDING_STATUSES:
            rep.err("audit", p, "BAD_FINDING_STATUS", f"status {f.get('status')!r} not in {sorted(FINDING_STATUSES)}")
        if f.get("owner") not in TEAM:
            rep.err("audit", p, "BAD_OWNER", f"owner {f.get('owner')!r} must be a team agent id or 'owner'")
        if not isinstance(f.get("fixable_by_team"), bool):
            rep.err("audit", p, "FIXABLE_UNSET", "fixable_by_team must be true or false")
        if not f.get("required_fix"):
            rep.err("audit", p, "NO_REQUIRED_FIX", "every finding states the fix")
        for ref in f.get("evidence") or []:
            if isinstance(ref, str) and ref.startswith("DOC-") and ref not in ctx["docs"]:
                rep.err("audit", p, "UNKNOWN_SOURCE", f"evidence {ref!r} not in manifest documents")
    open_crit = [f for f in findings if f.get("severity") == "CRITICAL" and f.get("status") == "OPEN"]
    if au.get("verdict") == "PASS" and open_crit:
        rep.err("audit", "/verdict", "PASS_WITH_OPEN_CRITICAL", "auditor verdict PASS while CRITICAL findings are OPEN")
    if au.get("verdict") not in {"PASS", "FAIL"}:
        rep.err("audit", "/verdict", "BAD_VERDICT", "verdict must be PASS or FAIL")
    return findings


def readiness(rows: list, proc: dict, findings: list, errors: int) -> dict:
    n = len(rows) or 1
    ing = sum(VERDICT_WEIGHT.get(r.get("verdict"), 0.0) for r in rows) / n
    prc = proc["steps_ok"] / proc["steps_total"] if proc["steps_total"] else 0.0
    docs = max(0.0, 1 - proc["blocking_missing"] / BLOCKING_CHECKLIST_ITEMS)
    score = round(100 * (0.6 * ing + 0.15 * prc + 0.25 * docs))
    ingredient_blockers = [r.get("ingredient_id") for r in rows
                           if r.get("verdict") in PROBLEM_VERDICTS and r.get("risk_level") != "LOW"]
    open_crit = [f.get("finding_id") for f in findings
                 if f.get("severity") == "CRITICAL" and f.get("status") in {"OPEN", "OWNER_ACTION"}]
    blockers = len(ingredient_blockers) + proc["blocking_missing"] + len(open_crit)
    if errors:
        status = "INVALID_PACK"
    elif blockers:
        status = "NOT_READY"
    elif score >= 85:
        status = "READY"
    else:
        status = "NEEDS_WORK"
    counts: dict = {}
    for r in rows:
        counts[r.get("verdict")] = counts.get(r.get("verdict"), 0) + 1
    return {
        "status": status,
        "score": score,
        "components": {"ingredients": round(ing, 3), "process_steps": round(prc, 3), "documents": round(docs, 3)},
        "verdict_counts": counts,
        "blockers": {"total": blockers, "ingredients": ingredient_blockers,
                     "blocking_missing_documents": proc["blocking_missing"], "open_critical_findings": open_crit},
        "formula": "100 * (0.6*ingredients + 0.15*process_steps + 0.25*documents); "
                   "ingredient weights VERIFIED=1, EXPIRING=0.75, LOW_RISK_NO_CERT=0.5, other=0; "
                   f"documents = 1 - blocking_missing/{BLOCKING_CHECKLIST_ITEMS}",
    }


def validate(out_dir: Path, case_dir: Path, as_of: dt.date | None, warn_days: int) -> dict:
    rep = Report()
    data = {}
    for part, name in FILES.items():
        path = out_dir / name
        if not path.exists():
            if part != "audit":
                rep.err(part, "", "FILE_MISSING", f"{name} not found in {out_dir}")
            continue
        try:
            data[part] = load(path)
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            rep.err(part, "", "BAD_JSON", f"{name}: {e}")

    if "manifest" not in data:
        return {"passed": False, "errors": rep.errors, "warnings": rep.warnings, "readiness": None}

    m = data["manifest"]
    as_of = as_of or parse_date(m.get("as_of"))
    if not as_of:
        rep.err("manifest", "/as_of", "BAD_AS_OF", "as_of must be YYYY-MM-DD")
        as_of = dt.date.today()
    ctx = check_manifest(m, case_dir, out_dir, rep)
    rows = check_matrix(data["matrix"], ctx, as_of, warn_days, rep) if "matrix" in data else []
    proc = check_process(data["process"], ctx, rep) if "process" in data else \
        {"steps_total": 0, "steps_ok": 0, "blocking_missing": BLOCKING_CHECKLIST_ITEMS, "missing_total": 0}
    findings = check_audit(data["audit"], ctx, rep) if "audit" in data else []
    if "audit" not in data:
        rep.warn("audit", "", "NO_AUDIT", "no audit report yet; readiness ignores audit findings")
    return {
        "passed": not rep.errors,
        "as_of": as_of.isoformat(),
        "expiry_warning_days": warn_days,
        "errors": rep.errors,
        "errors_by_owner": {o: sum(1 for e in rep.errors if e["owner"] == o) for o in sorted(set(OWNERS.values()))},
        "warnings": rep.warnings,
        "readiness": readiness(rows, proc, findings, len(rep.errors)),
    }


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Validate a HalalPilot readiness pack.")
    ap.add_argument("output_dir", type=Path)
    ap.add_argument("--case-dir", type=Path)
    ap.add_argument("--as-of")
    ap.add_argument("--expiry-warning-days", type=int, default=90)
    ap.add_argument("--out", type=Path)
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args(argv)

    out_dir = a.output_dir.resolve()
    if not out_dir.is_dir():
        print(f"error: {out_dir} is not a directory", file=sys.stderr)
        return 2
    as_of = parse_date(a.as_of) if a.as_of else None
    if a.as_of and not as_of:
        print("error: --as-of must be YYYY-MM-DD", file=sys.stderr)
        return 2
    case_dir = (a.case_dir or out_dir.parent).resolve()
    result = validate(out_dir, case_dir, as_of, a.expiry_warning_days)

    target = a.out or out_dir / "validation-report.json"
    target.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if not a.quiet:
        rd = result.get("readiness") or {}
        print(f"validation: {'PASS' if result['passed'] else 'FAIL'} — {len(result['errors'])} error(s), "
              f"{len(result['warnings'])} warning(s)")
        for e in result["errors"]:
            print(f"  [{e['code']}] {e['file']}{e['pointer']} → {e['owner']}: {e['message']}")
        if rd:
            print(f"readiness: {rd['status']} (score {rd['score']}/100, blockers {rd['blockers']['total']})")
        print(f"report: {target}")
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
