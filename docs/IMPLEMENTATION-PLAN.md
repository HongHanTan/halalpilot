# HalalPilot — WorkBuddy Expert Team: Implementation Plan

**Goal:** One prompt ("Get me ready for halal certification") over a messy SME folder → a
validated, evidence-linked halal readiness pack. No website in this phase.

## 1. Format we follow (and where it comes from)

WorkBuddy runs on the CodeBuddy plugin runtime. There is no single official "Expert Team"
spec page, so the structure is assembled from:

| Source | What it fixes |
|---|---|
| CodeBuddy plugin reference (workbuddy.ai/docs/cli/plugins-reference) | `.codebuddy-plugin/plugin.json`, `agents/`, `skills/<name>/SKILL.md`, root `settings.json` (`agent` key applied at runtime), allowed agent frontmatter (no `hooks`/`mcpServers`/`permissionMode` in plugin agents) |
| CodeBuddy sub-agents + Agent Teams docs | Lead creates the team, spawns named members via the Agent tool, members report back, lead shuts them down and cleans up |
| `airen/workbuddy-hub` published teams + `verify_upload_ready.py` | Team marketplace fields: `expertType: "team"`, `agentName = <id>-team-lead`, `teamInfo`, `members[]`, exactly 3 `tags`, exactly 3 `quickPrompts`, `defaultInitPrompt == quickPrompts[0]`, `displayDescription.zh` 40–50 UTF-16 units, `profession.zh == displayName.zh`, `settings.json.agent == agentName` |

## 2. File structure

```
halalbuddy/                                 (workspace)
├── docs/IMPLEMENTATION-PLAN.md             this file
├── scripts/validate_plugin.py              structural validator for the plugin package
├── tests/test_validate_pack.py             pack-validator tests (honest run + injected fabrications)
├── tests/test_validate_plugin.py           package-validator tests
├── tests/fixtures/sample-run/              a reference team output for the sample case
├── samples/kedai-sambal-contoh/            fictional SME input folder (recipes, invoices, certs, photos)
└── halalpilot/                             ← plugin root (dir name == plugin name)
    ├── .codebuddy-plugin/plugin.json       manifest + team metadata
    ├── settings.json                       {"agent": "halalpilot-team-lead"}
    ├── README.md
    ├── avatars/                            team + one per agent
    ├── agents/
    │   ├── halalpilot-team-lead.md                 orchestrator
    │   ├── halalpilot-evidence-clerk.md            folder → case manifest
    │   ├── halalpilot-ingredient-investigator.md   ingredient ↔ supplier ↔ cert matrix
    │   ├── halalpilot-process-builder.md           flows, SOP drafts, missing-docs list
    │   └── halalpilot-mock-auditor.md              independent audit → structured findings
    └── skills/
        ├── halal-evidence-protocol/        shared rules: NEEDS_REVIEW, status vocab, risk ingredients, doc checklist
        └── halal-readiness-pack/           data contracts, templates, scripts/validate_pack.py
```

## 3. Workflow (lead-orchestrated)

| Phase | Who | Parallel? | Output (in `<case>/halalpilot-output/`) |
|---|---|---|---|
| 0 Intake & plan | Lead | — | `00-plan.md`; **TeamCreate** (lead only) |
| 1 Evidence extraction | Evidence Clerk | single | `01-case-manifest.json` |
| 2 Build | Ingredient Investigator ∥ Process Builder | **yes** — both read only the manifest | `02-ingredient-matrix.json`, `03-process-pack.json` |
| 3 Validate | `validate_pack.py` ∥ Mock Auditor | **yes** | `validation-report.json`, `04-audit-report.json` |
| 4 Repair loop | Lead routes each failure to its `owner` agent; owners fix in parallel; re-run Phase 3 | yes | updated files, `05-repair-log.json` (max 3 rounds) |
| 5 Deliver | Lead | — | `READINESS-PACK.md` (score from validator, never self-scored), team shutdown + cleanup |

**Termination rule:** a finding that needs evidence the folder does not contain is *not* repairable
by the team. The owner marks it `NEEDS_REVIEW` and moves it to `missing_documents`; the loop then
stops treating it as a pack defect. The loop stops when validation has 0 errors and the auditor has
no team-fixable CRITICAL/MAJOR findings, or after 3 rounds.

## 4. Non-negotiable evidence rule

Every factual field carries `source` (a `doc_id` from the manifest) **or** `status: "NEEDS_REVIEW"`.
`validate_pack.py` enforces it mechanically: unknown `doc_id`s, `VERIFIED` rows without a cert,
cert dates that differ from the manifest, and expired certs marked as valid are all errors.
SOPs written by the Process Builder are labelled `DRAFT_FOR_OWNER`, never presented as existing practice.

## 5. Smallest working version (this delivery)

1. Plugin package that passes `scripts/validate_plugin.py` (all hub upload rules).
2. Sample case with deliberate gaps: one expired cert, one certificate that names a different product, one
   high-risk emulsifier with no cert, one ingredient with no invoice, an unreadable photo.
3. `validate_pack.py` + tests proving it accepts an honest run and rejects invented evidence.

**Out of scope now:** website, certificate watchdog (scheduled re-check), live lookup against the
JAKIM/MYeHALAL directory (the investigator records `NEEDS_REVIEW: verify online` instead).
