---
name: halal-evidence-protocol
display_name: Halal Evidence Protocol
display_name_en: Halal Evidence Protocol
display_name_zh: 清真证据协议
description: Use whenever extracting, matching, judging or citing halal-certification evidence — recipes, supplier invoices, halal certificates, kitchen photos. Defines the NEEDS_REVIEW rule, source citation, status vocabulary, certificate validity checks and high-risk ingredient screening. Triggers on "halal", "certificate", "sijil halal", "supplier", "invoice", "ingredient", "expiry", "E471", "gelatin", "NEEDS_REVIEW".
description_zh: 清真认证材料的证据规范：NEEDS_REVIEW 规则、来源引用、状态词表、证书有效期核查与高风险原料筛查。
description_en: Evidence rules for halal-certification material — NEEDS_REVIEW rule, source citation, status vocabulary, certificate validity checks and high-risk ingredient screening.
category: business-tools
version: 0.1.0
author: HalalPilot
---

# Halal Evidence Protocol

Every HalalPilot agent follows this protocol. Without it, the outputs of the Evidence Clerk,
Ingredient Investigator, Process Builder and Mock Auditor cannot be cross-checked by the
validator, and the readiness pack cannot be trusted.

## 1. Rules that cannot be broken

1. **Never invent evidence.** Do not fill a supplier, certificate number, issuer, expiry date,
   product name, quantity or observation that you cannot point to in a document. If it is not
   there, the value is `null` and the status is `NEEDS_REVIEW` with a reason.
2. **Every fact has a source.** Any field you assert carries `"source": "DOC-xxx"`, a `doc_id` that
   exists in `01-case-manifest.json`. A fact without a source is invalid.
3. **Copy, do not normalise away.** Keep names as written (`"Belacan Pak Ali"`, `"SF-210"`).
   Put any normalisation in a separate field (`name_normalised`), never over the original.
4. **Unreadable means unreadable.** If a photo is blurred or a scan is cut off, set
   `"readable": false` and extract nothing from it. Do not guess from partial characters.
5. **Drafts are not evidence.** Procedures, policies and flows you write are labelled
   `DRAFT_FOR_OWNER`. They describe what the owner should adopt, not what already exists.
6. **Plausible is not verified.** "Cooking oil is usually halal" is never a verdict. Only a
   matching, unexpired certificate that is in the folder gives `VERIFIED`.

## 2. Status vocabulary (use exactly these strings)

| Field | Allowed values |
|---|---|
| extraction `status` | `EXTRACTED`, `NEEDS_REVIEW` |
| photo observation `status` | `OBSERVED`, `NEEDS_REVIEW` |
| ingredient `risk_level` | `LOW`, `MEDIUM`, `HIGH` |
| ingredient `verdict` | `VERIFIED`, `EXPIRING`, `EXPIRED`, `MISMATCH`, `NO_CERT`, `LOW_RISK_NO_CERT`, `NEEDS_REVIEW` |
| process step / SOP `status` | `DRAFT_FOR_OWNER`, `NEEDS_REVIEW` |
| audit finding `severity` | `CRITICAL`, `MAJOR`, `MINOR` |

## 3. Certificate checks (Ingredient Investigator and Mock Auditor)

Given the run date `as_of` (from the case manifest):

| Condition | Verdict |
|---|---|
| Cert in folder, holder matches the invoice supplier or the brand owner, product on cert matches the invoiced item (same name and code), `expiry_date > as_of + 90 days` | `VERIFIED` |
| Same as above, but expiry is within 90 days of `as_of` | `EXPIRING` |
| `expiry_date <= as_of` | `EXPIRED` |
| A cert exists but the product, code or holder differs from the invoiced item (e.g. cert `SF-200`, invoice `SF-210`) | `MISMATCH` |
| No certificate in the folder for a MEDIUM or HIGH risk ingredient | `NO_CERT` |
| No certificate in the folder for an unprocessed LOW risk item (fresh vegetables, plain water) | `LOW_RISK_NO_CERT`. The owner still has to confirm with the certifier whether a declaration is required |
| Supplier unknown (no invoice) or the cert's expiry date cannot be read | `NEEDS_REVIEW` |

Never mark `VERIFIED` without (a) a `cert_id` from the manifest and (b) the manifest's expiry date
copied exactly. The validator re-checks both.

**Not checked here:** whether a certificate is genuine and currently listed in the official
JAKIM / state-authority (JAIN/MAIN) directory, or whether a foreign certifier is recognised. Always
add an action `"Verify certificate <no> in the official halal directory"` and let the auditor treat
it as an open item.

## 4. High-risk ingredient screening

Screen every ingredient against `@references/risk-ingredients.md`. The core idea: anything
that **may be animal-derived, alcohol-derived or processed with an undisclosed carrier** is at least
`MEDIUM`. E-numbers in the emulsifier and stabiliser range, gelatin, shortening, flavourings and
enzymes are `HIGH` until a matching certificate is in hand.

## 5. Document checklist

`@references/document-checklist.md` lists the business-level documents a halal application
typically needs. The Process Builder turns every item that is missing from the folder into a
`missing_documents` entry. Requirements vary by scheme, product category and company size, so each
item is phrased as "typically required — confirm with the certifying authority". HalalPilot prepares
an application; it does not certify anything and does not replace the official guidelines.

## 6. Citing evidence in prose (readiness pack)

Write `Belacan Pak Ali certificate expired on 2026-08-31 [DOC-007]`. The bracketed `doc_id`
resolves to a file path in the manifest's `documents` table, which the pack reproduces as an
appendix.
