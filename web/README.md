# HalalPilot — web app

The HalalPilot expert team, running as a public webpage: upload a zip of your business folder, type one
prompt, watch the five agents work, download a validated readiness pack.

Same agent instructions and the same validator as the WorkBuddy expert team in `../halalpilot/`.
This folder is a second surface, not a fork: `scripts/sync-prompts.mjs` copies the agent bodies, the
skill references and the JSON templates out of the plugin at every build, so the plugin stays the
single source of truth.

## How a run works

The browser is the team lead (`../halalpilot/agents/halalpilot-team-lead.md`). Each agent phase is one
stateless `POST /api/agent`, so no single serverless request runs long, and phases that are independent
really do run at the same time.

| Phase | Who | Parallel | Produces |
|---|---|---|---|
| 0 Intake | browser: unzip, inventory, assign `DOC-001…`, `as_of` = today | | file inventory |
| 1 Evidence extraction | Evidence Clerk, then gate G1 (validator, max 2 retries) | | `01-case-manifest.json` |
| 2 Build | Ingredient Investigator ∥ Process Builder | yes | `02-ingredient-matrix.json`, `03-process-pack.json` |
| 3 Validate | `lib/validate.ts` ∥ Mock Auditor | yes | `validation-report.json`, `04-audit-report.json` |
| 4 Repair | validator errors + open team-fixable findings routed to the owning agent, then re-validate (≤ 2 rounds) | yes | updated files, `05-repair-log.json` |
| 5 Assemble | pure TypeScript, no model | | `READINESS-PACK.md` |

The readiness score and status always come from the validator, never from an agent.
`OWNER_ACTION` findings are not sent for repair: only the business can supply that evidence.

## Run it locally

```bash
cp .env.example .env.local      # then put your Gemini API key in GEMINI_API_KEY
npm install
npm run dev                     # http://localhost:3000
```

Click **Use the demo case** to load `demo_dataset/sambal-mak-embun.zip` and press Run.

## Deploy to Vercel

1. Push the repo, then import it at vercel.com.
2. **Root Directory: `web`** (Next.js is detected from there).
3. Environment variables:
   - `GEMINI_API_KEY` — required, server-side only.
   - `GEMINI_MODEL` — optional, default `gemini-2.5-flash`.
   - `ACCESS_CODE` — optional. If set, the page must send the same code before any agent call, so a
     public URL cannot burn your quota.
4. Keep **Fluid Compute** on (default). `/api/agent` declares `maxDuration = 300`.

## Limits and guardrails

- Zip ≤ 15 MB, ≤ 80 files; text truncated at 20k characters per file; photos downscaled to 1024 px in
  the browser; total readable payload capped at 3.8 MB to stay under the serverless body limit.
- Document contents are passed to the model wrapped in `<document>` tags and declared untrusted; the
  system prompt tells every agent to ignore instructions found inside them.
- The validator is the backstop against invented evidence: unknown `doc_id`s, re-typed expiry dates,
  `VERIFIED` without a certificate and understated risk ingredients are all mechanical errors.
- Nothing is stored. The files live in the browser tab and in the one request that carries them.

## Tests

```bash
npm run test:pipeline   # offline: replays recorded demo outputs through the orchestrator (no API calls)
npm run test:parity     # lib/validate.ts vs validate_pack.py on both fixtures, 24 mutations (needs py/python3)
npm test                # both
```

`test:parity` is the one that matters if you touch `lib/validate.ts`: it fails the moment the
TypeScript port disagrees with the Python validator on an error code, a pointer, an owner or the score.
