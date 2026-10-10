# Halal Certification Readiness Pack — {{business_name}}

> Prepared by HalalPilot on {{as_of}}. This is a **preparation pack**, not a certificate. It must be
> checked against the current requirements of the certifying authority before submission.
> Items marked **NEEDS_REVIEW** are gaps HalalPilot could not fill from your documents. It did not guess them.

## 1. Readiness at a glance

| | |
|---|---|
| Status | **{{readiness.status}}** |
| Readiness score | **{{readiness.score}} / 100** (computed by `validate_pack.py`, formula in Appendix C) |
| Blockers | {{readiness.blockers.total}} |
| Pack validation | {{passed ? "PASS" : "FAIL"}}: {{errors}} integrity errors |
| Mock audit | {{audit.verdict}} after {{repair_rounds}} repair round(s) |

**Do these first** (blocking, in order):
1. {{top blocker — owner action, one line}}

## 2. Ingredient X-ray

| Product | Ingredient | Risk | Supplier | Certificate | Expiry | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| {{product}} | {{ingredient}} | {{risk_level}} | {{supplier or NEEDS_REVIEW}} | {{certificate_no or —}} | {{cert_expiry or —}} | {{verdict}} | {{[DOC-xxx]}} |

### Messages to suppliers (drafts — review before sending)
{{supplier_requests[].draft_message}}

## 3. Process flows (DRAFT_FOR_OWNER)
{{one numbered flow per product; halal control points marked ★}}

## 4. Procedures (DRAFT_FOR_OWNER)
{{SOP titles + steps + records to keep}}

## 5. Halal policy (draft for owner signature)
{{halal_policy_draft.text}}

## 6. Missing documents checklist

| # | Document | Why | What you need to do | Blocking |
|---|---|---|---|---|

## 7. Mock audit result
{{findings table: id, severity, issue, status (RESOLVED / OWNER_ACTION / OPEN)}}

## Appendix A — Evidence register
{{documents table: doc_id, path, type, readable}}

## Appendix B — Everything marked NEEDS_REVIEW
{{every NEEDS_REVIEW item from all files, with reason}}

## Appendix C — How the score is computed
{{readiness.formula}}
