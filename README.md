# HalalPilot — WorkBuddy Expert Team

One prompt, *"Get me ready for halal certification"*, over a folder of recipes, supplier invoices,
halal certificates and kitchen photos, and the team returns an evidence-linked readiness pack for a
micro food business. Every claim cites a file. Every gap is labelled `NEEDS_REVIEW`. Nothing is invented.

## Team

| Agent | Job | Output |
|---|---|---|
| **HalalPilot Lead** (`halalpilot-team-lead`) | Plans, creates the team, dispatches, relays, gates, assembles | `00-plan.md`, `05-repair-log.json`, `READINESS-PACK.md` |
| **Evidence Clerk** | Folder → structured case manifest | `01-case-manifest.json` |
| **Ingredient Investigator** | Ingredient ↔ invoice ↔ certificate, risk screen, supplier requests | `02-ingredient-matrix.json` |
| **Process Builder** | Process flows, SOP drafts, halal policy, missing documents | `03-process-pack.json` |
| **Mock Auditor** | Independent strict audit, structured findings | `04-audit-report.json` |

```
Phase 0  Lead: plan + TeamCreate
Phase 1  Evidence Clerk ──────────────► 01 manifest ── gate
Phase 2  Investigator ∥ Process Builder ► 02 matrix, 03 process pack
Phase 3  validate_pack.py ∥ Mock Auditor ► validation-report, 04 audit
Phase 4  failures → owners (parallel) → rerun Phase 3   (≤ 3 rounds)
Phase 5  Lead: READINESS-PACK.md (score from validator) → shutdown + cleanup
```

## Package layout

```
halalpilot/
├── .codebuddy-plugin/plugin.json   manifest, team roster, marketplace metadata
├── settings.json                   {"agent": "halalpilot-team-lead"}: the lead is the session agent
├── agents/                         five agent definitions
├── skills/
│   ├── halal-evidence-protocol/    NEEDS_REVIEW rule, status vocabulary, risk ingredients, doc checklist
│   └── halal-readiness-pack/       data contracts, templates/, scripts/validate_pack.py
└── avatars/
```

## Check it

From the workspace root:

```bash
python scripts/validate_plugin.py halalpilot           # package structure + marketplace rules
python -m unittest discover -s tests -v                # validator tests against the sample case
python halalpilot/skills/halal-readiness-pack/scripts/validate_pack.py \
       tests/fixtures/sample-run --case-dir samples/kedai-sambal-contoh
```

## Try it in WorkBuddy

1. Install the `halalpilot/` folder as an expert-team plugin (zip it with `halalpilot/` as the top-level
   folder for upload).
2. Open a session with the HalalPilot team, in a workspace that contains `samples/kedai-sambal-contoh/`
   (or your own folder).
3. Prompt: *"Get me ready for halal certification. My documents are in samples/kedai-sambal-contoh."*
4. Compare the result with `samples/README.md`, which lists the 8 planted gaps the team must find.

## Limits (v0.1)

- Prepares an application. It does not certify, and it does not check certificates against the live
  official halal directory. That stays an explicit action item in the pack.
- No certificate watchdog (scheduled re-checks) yet.
