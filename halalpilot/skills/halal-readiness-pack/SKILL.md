---
name: halal-readiness-pack
display_name: Halal Readiness Pack
display_name_en: Halal Readiness Pack
display_name_zh: 清真认证准备包
description: Use when producing, repairing, validating or assembling any HalalPilot output file — case manifest, ingredient matrix, process pack, audit report, repair log or the final readiness pack. Defines the output folder, the JSON data contracts, the templates and the validate_pack.py gate that computes the readiness score. Triggers on "case manifest", "ingredient matrix", "process pack", "audit report", "readiness pack", "validate pack", "readiness score".
description_zh: HalalPilot 输出文件的数据契约、模板与 validate_pack.py 校验闸门，用于生成、修复、校验与汇编清真认证准备包。
description_en: Data contracts, templates and the validate_pack.py gate for producing, repairing, validating and assembling a HalalPilot readiness pack.
category: business-tools
version: 0.1.0
author: HalalPilot
---

# Halal Readiness Pack: contracts, templates and the validation gate

Read `halal-evidence-protocol` first. This skill says **where** things go and **what shape** they
take. The protocol says what counts as evidence.

## 1. Output folder

All outputs go to `<case-folder>/halalpilot-output/`. Never write into the owner's own files.

| File | Written by | Template |
|---|---|---|
| `00-plan.md` | halalpilot-team-lead | — |
| `01-case-manifest.json` | halalpilot-evidence-clerk | `templates/case-manifest.template.json` |
| `02-ingredient-matrix.json` | halalpilot-ingredient-investigator | `templates/ingredient-matrix.template.json` |
| `03-process-pack.json` | halalpilot-process-builder | `templates/process-pack.template.json` |
| `04-audit-report.json` | halalpilot-mock-auditor | `templates/audit-report.template.json` |
| `05-repair-log.json` | halalpilot-team-lead | `templates/repair-log.template.json` |
| `validation-report.json` | `scripts/validate_pack.py` | generated |
| `READINESS-PACK.md` | halalpilot-team-lead | `templates/readiness-pack.template.md` |

Templates sit next to this `SKILL.md`. Copy their **shape** (keys, ID formats, status strings).
Drop every `_comment` key and placeholder from real output.

## 2. ID conventions

`DOC-001…` documents · `P1…` products · `P1-I01…` ingredients · `S1…` suppliers · `L1…` invoice lines ·
`C1…` certificates · `O1…` photo observations · `NR-01…` needs-review items · `MD-01…` missing documents ·
`SOP-01…` procedures · `SR-01…` supplier requests · `F-01…` audit findings.
IDs are created by the file's owner and are **never renumbered** in a repair round: other files point at them.

## 3. Running the validation gate

The script is `scripts/validate_pack.py` in this skill's directory (standard-library Python 3.9+):

```bash
python "<skill-dir>/scripts/validate_pack.py" "<case-folder>/halalpilot-output"
# options: --case-dir DIR  --as-of YYYY-MM-DD  --expiry-warning-days 90  --out FILE  --quiet
```

If you do not know `<skill-dir>`, find the file with Glob: `**/halal-readiness-pack/scripts/validate_pack.py`
(installed plugins live under `~/.workbuddy/plugins/`).

It writes `validation-report.json`:

- `errors[]`: pack defects. Each has `code`, `file`, `pointer` (JSON pointer), `message` and **`owner`**,
  the agent who must fix it. The lead routes errors by `owner`.
- `readiness`: `status` (`INVALID_PACK` / `NOT_READY` / `NEEDS_WORK` / `READY`), `score`, the `blockers` list
  and the formula used. **The pack's score is always this number.** No agent estimates its own.

Exit code `0` means the pack is internally consistent. That is not the same as ready: an honest pack
for a business with gaps exits `0` with `NOT_READY`.

### What the gate catches

| Code | Meaning |
|---|---|
| `FACT_WITHOUT_SOURCE`, `UNKNOWN_SOURCE`, `SOURCE_UNREADABLE` | A fact with no real document behind it |
| `NEEDS_REVIEW_WITHOUT_REASON` | A gap that does not say what is missing |
| `FILE_NOT_CATALOGUED`, `DOC_NOT_FOUND` | The clerk skipped a file or cited a path that does not exist |
| `INGREDIENT_NOT_COVERED`, `FLOW_MISSING` | An ingredient or product was dropped downstream |
| `EXPIRY_MISMATCH` | Matrix expiry differs from the certificate in the manifest (re-typed or invented) |
| `VERDICT_INCONSISTENT` | `VERIFIED` / `EXPIRING` / `EXPIRED` does not match the dates |
| `UNKNOWN_CERT`, `UNTRACED_SUPPLIER` | A certificate verdict with no certificate or no supplier trace |
| `RISK_UNDERSTATED` | Gelatin, E4xx, flavouring, shortening, etc. not rated `HIGH` |
| `NO_ACTION` | A problem verdict with no next step for the owner |
| `PASS_WITH_OPEN_CRITICAL` | The auditor passed a pack with an open CRITICAL finding |

## 4. Repair rules (every member)

When the lead sends you a repair list:

1. Fix only the listed items, in your own file. Keep all IDs stable.
2. If the fix needs evidence that is not in the folder, do **not** produce it. Set the item to
   `NEEDS_REVIEW` with a reason and, where relevant, tell the lead it should become a missing-document
   or owner action.
3. If you believe a finding is wrong, reply `disputed` with the evidence. Do not change the file.
4. Reply with a structured summary: `{ "fixed": [...], "converted_to_needs_review": [...], "disputed": [...] }`.
