<h1 align="center">HalalPilot</h1>

<p align="center"><strong>From a shoebox of documents to a halal application a certifier will accept.</strong></p>

<p align="center">
  <a href="https://halalpilot.vercel.app/"><strong>▶ Live demo</strong></a> ·
  <a href="HalalPilot-pitch-deck.pdf"><strong>Pitch deck</strong></a> ·
  <a href="demo_dataset/sambal-mak-embun/halalpilot-output/READINESS-PACK.md"><strong>Sample output</strong></a>
</p>

<p align="center">Built by team <strong>mmhunter</strong> for DORMATHON 2026 · WorkBuddy Track</p>

---

One prompt — *"Get me ready for halal certification"* — over a micro food business's messy folder of
recipes, supplier invoices, halal certificates and kitchen photos. Five agents return an
evidence-linked readiness pack. **Every claim cites a file. Every gap is labelled `NEEDS_REVIEW`.
Nothing is invented.**

## The problem

In Malaysia, halal certification opens the door to supermarkets, hotels and export. Most micro food
businesses never get it — they fail on paperwork, not on product. The application demands that every
ingredient be traced back to a supplier holding a valid, unexpired, correctly-scoped halal
certificate; that process flows and SOPs be documented; that a halal policy be signed and an audit
survived. Consultants charge thousands of ringgit for this clerical work, so home-based sambal
makers, bakeries and frozen-food SMEs give up and stay at the pasar.

## What it catches

The demo case is a fictional home-based sambal maker in Kajang with four deliberately planted
failures. A correct run must find all four and must not wave any of them through.

| # | Planted failure | What HalalPilot reports |
|---|---|---|
| 1 | Chilli supplier's certificate expired **before** the invoice was issued | `EXPIRED`, CRITICAL, plus a renewal request drafted to the supplier in Malay |
| 2 | Dried-shrimp certificate belongs to a *different company* than the actual supplier, and covers branded packs when the invoice is for bulk | `MISMATCH` — not accepted just because the ingredient name matches |
| 3 | Chicken flavour powder contains chicken fat, has no certificate, manufacturer not stated | `NO_CERT`, `HIGH` risk, CRITICAL |
| 4 | SOP index lists a cleaning procedure whose file does not exist | Flagged as missing and drafted as `DRAFT_FOR_OWNER` — never claimed to exist |

**Result:** `NOT_READY`, **75 / 100**, 7 blockers, pack validation **PASS** with 0 integrity errors.
An honest diagnosis the owner can act on this week, not a green tick that falls apart at the
certifier's desk.
[Read the full pack →](demo_dataset/sambal-mak-embun/halalpilot-output/READINESS-PACK.md)

## The team

| Agent | Job | Output |
|---|---|---|
| **HalalPilot Lead** (`halalpilot-team-lead`) | Plans, creates the team, dispatches, relays, gates, assembles | `00-plan.md`, `05-repair-log.json`, `READINESS-PACK.md` |
| **Evidence Clerk** | Folder → structured case manifest, every file tagged `DOC-xxx` | `01-case-manifest.json` |
| **Ingredient Investigator** | Ingredient ↔ invoice ↔ certificate, risk screen, supplier requests | `02-ingredient-matrix.json` |
| **Process Builder** | Process flows, SOP drafts, halal policy, missing documents | `03-process-pack.json` |
| **Mock Auditor** | Independent strict audit, structured findings | `04-audit-report.json` |

```
Phase 0  Lead: plan + TeamCreate
Phase 1  Evidence Clerk ──────────────► 01 manifest ── validator gate
Phase 2  Investigator ∥ Process Builder ► 02 matrix, 03 process pack
Phase 3  validate_pack.py ∥ Mock Auditor ► validation-report, 04 audit
Phase 4  failures → owning agent (parallel) → rerun Phase 3   (capped)
Phase 5  Lead: READINESS-PACK.md (score from validator) → shutdown + cleanup
```

## Why you can trust the output

Compliance paperwork is where a language model is most dangerous: asked to look complete, it will
invent a certificate number — and a fabricated compliance document is worse than no document at all.
HalalPilot is built so that it cannot.

- **Evidence rule.** Every factual field carries a `source` (a `doc_id` that exists in the manifest)
  **or** `status: "NEEDS_REVIEW"`. A fact without a source is invalid.
- **A deterministic validator, outside the model.** Unknown `doc_id`s, `VERIFIED` rows with no
  certificate behind them, re-typed expiry dates that disagree with the manifest, expired
  certificates marked valid and understated risk ingredients are all mechanical errors.
- **The score is computed, never self-assigned:**
  `100 × (0.6 × ingredients + 0.15 × process_steps + 0.25 × documents)`, printed in the pack
  together with its inputs.
- **The auditor is a different agent from the builder,** so the audit is adversarial rather than
  self-congratulatory.
- **The repair loop knows when to stop.** Findings only the business can supply evidence for — an
  expired supplier certificate, an unsigned policy — become `OWNER_ACTION` items instead of looping
  forever.
- **Drafts are labelled drafts.** SOPs and policies the Process Builder writes are
  `DRAFT_FOR_OWNER`, never presented as existing practice.
- **Documents are treated as untrusted input,** wrapped in `<document>` tags, and every agent is
  instructed to ignore instructions found inside them.
- **Two validator implementations, held in lockstep.** `validate_pack.py` (Python, for the expert
  team) and `web/lib/validate.ts` (TypeScript, for the web app) are checked against each other by a
  parity test over 24 mutations on two fixtures — it fails the moment they disagree on an error
  code, a pointer, an owner or the score.

## Try it

### Web app

```bash
cd web
cp .env.example .env.local      # put your Gemini API key in GEMINI_API_KEY
npm install
npm run dev                     # http://localhost:3000
```

Click **Use the demo case** to load `demo_dataset/sambal-mak-embun.zip`, then press Run. Nothing is
stored — the files live in the browser tab and in the one request that carries them.

### WorkBuddy expert team

1. Install the `halalpilot/` folder as an expert-team plugin (zip it with `halalpilot/` as the
   top-level folder for upload).
2. Open a session with the HalalPilot team in a workspace containing
   `demo_dataset/sambal-mak-embun/` (or your own folder).
3. Prompt: *"Get me ready for halal certification. My documents are in demo_dataset/sambal-mak-embun."*
4. Compare the run against `demo_dataset/ANSWER-KEY.md`, which the agents never see.

### Tests

```bash
python scripts/validate_plugin.py halalpilot      # package structure + marketplace rules
python -m unittest discover -s tests -v           # validator tests, including injected fabrications
cd web && npm run test:pipeline                   # offline replay of recorded demo outputs
cd web && npm run test:parity                     # TypeScript validator vs the Python one
```

## What's in the repo

```
halalpilot/            the WorkBuddy expert-team plugin — the single source of truth
  agents/              five agent definitions
  skills/
    halal-evidence-protocol/   NEEDS_REVIEW rule, status vocabulary, risk ingredients, doc checklist
    halal-readiness-pack/      data contracts, templates/, scripts/validate_pack.py
web/                   Next.js web app; scripts/sync-prompts.mjs copies the agent bodies from the plugin
demo_dataset/          Sambal Mak Embun — the demo case, with ANSWER-KEY.md held outside it
samples/               a second fictional case, with eight planted gaps
tests/                 validator tests, including injected-fabrication cases
docs/                  implementation plan
```

The web app is a second surface, not a fork: `web/scripts/sync-prompts.mjs` copies the agent bodies,
skill references and JSON templates out of the plugin at every build, so the plugin stays the single
source of truth.

## Roadmap

| | |
|---|---|
| **Next** | **Certificate watchdog** — opt-in storage so a pack can be re-checked, a warning before a supplier certificate lapses, and the renewal request drafted. **Live directory check** against JAKIM / state authorities: proof a certificate is real, not just present. |
| **Then** | **Certified-supplier directory**, so the pack can name suppliers who already hold the certificate instead of saying "find a certified alternative". **Portal submission guide**, ordered by upload slot. |
| **Later** | **Portal auto-fill** — every field and upload slot filled from the pack, in the owner's own browser; the owner reviews and submits. **Adjacent schemes** on the same evidence engine. |

Throughout: the engine already reads and writes Malay. The interface follows.

## Limits

- HalalPilot **prepares an application. It does not certify.**
- It does not check certificates against the live JAKIM / MYeHALAL / state-authority directory. That
  stays an explicit action item in the pack rather than a quiet assumption.
- No certificate watchdog (scheduled re-checks) yet.
- Web intake is capped at 15 MB and 80 files; text is truncated at 20k characters per file and
  photos are downscaled to 1024 px.
- Every business, supplier, certificate number and person in `demo_dataset/` and `samples/` is
  invented for testing. None of the certificates are real JAKIM documents.

## Team

Built by **mmhunter** for DORMATHON 2026, WorkBuddy Track.
