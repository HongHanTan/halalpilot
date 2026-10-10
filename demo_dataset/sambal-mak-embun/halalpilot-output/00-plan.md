# HalalPilot Plan — Sambal Mak Embun

## Goal
Turn the Sambal Mak Embun folder into a validated readiness pack for Malaysian halal certification.
Every claim traceable to one file; every gap labelled `NEEDS_REVIEW`.

- **as_of:** 2026-10-10
- **case folder:** `C:\Users\Hong Han\OneDrive\Desktop\halalbuddy\demo_dataset\sambal-mak-embun`
- **output folder:** `<case-folder>/halalpilot-output/`
- **business:** Sambal Mak Embun (Embun binti Contoh, Kajang, Selangor)
- **products:** Sambal Bawang Garing (SME-SBG-200), Sambal Udang Kering (SME-SUK-200)

## File inventory (28 files across 9 categories)

| Category | Files | Count |
|---|---|---|
| Business | `business/ssm-pendaftaran.txt`, `business/lesen-premis-mpkj.txt`, `business/pelan-premis.txt` | 3 |
| Staff | `staff/rekod-pengendali-makanan.txt` | 1 |
| Products | `products/spesifikasi-sambal-bawang-garing.txt`, `products/spesifikasi-sambal-udang-kering.txt`, `products/label-sambal-bawang-garing.txt`, `products/label-sambal-udang-kering.txt` | 4 |
| Recipes | `recipes/resepi-sambal-bawang-garing.txt`, `recipes/resepi-sambal-udang-kering.txt` | 2 |
| Invoices | `invoices/INV-SW-26-0815.txt`, `invoices/INV-KMT-0921.txt`, `invoices/INV-PHLK-3372.txt`, `invoices/INV-BBMC-1188.txt`, `invoices/spec-perisa-ayam-emas.txt` | 5 |
| Certificates | `certificates/sijil-halal-seri-wangi.txt`, `certificates/sijil-halal-minyak-teratai.txt`, `certificates/sijil-halal-gula-manis-jaya.txt`, `certificates/sijil-halal-garam-bintang-laut.txt`, `certificates/sijil-halal-asam-cap-pokok.txt`, `certificates/sijil-halal-udang-kering.txt` | 6 |
| Procedures | `procedures/SENARAI-SOP.txt`, `procedures/SOP-01-penerimaan-bahan.txt`, `procedures/SOP-02-penyimpanan.txt`, `procedures/SOP-04-kawalan-perosak.txt`, `procedures/laporan-servis-kawalan-perosak.txt` | 5 |
| Photos | `photos/01-ruang-memasak.jpg`, `photos/02-stor-kering.jpg` | 2 |

Note: all documents are marked as **SAMPLE / FICTIONAL** — not genuine JAKIM/JAIN records.
This is acknowledged in the manifest (`sample_or_fictional_marking: true`) and in the pack.

## Phases and agents

| Phase | Agent | Output |
|---|---|---|
| 1. Extract evidence | `halalpilot-evidence-clerk` | `01-case-manifest.json` |
| Gate G1 | validator on manifest | — |
| 2. Build (parallel) | `halalpilot-ingredient-investigator` | `02-ingredient-matrix.json` |
| 2. Build (parallel) | `halalpilot-process-builder` | `03-process-pack.json` |
| 3. Validate ∥ audit | validator + `halalpilot-mock-auditor` | `validation-report.json`, `04-audit-report.json` |
| 4. Repair loop (≤3) | dispatch by owner, rerun phase 3 | `05-repair-log.json` |
| 5. Assemble | lead | `READINESS-PACK.md` |

## Stop rules
- **Clean stop:** 0 validator errors AND no OPEN CRITICAL/MAJOR audit findings (fixable_by_team=true).
- **Max rounds:** stop after 3 repair rounds.
- **Owner actions only:** if remaining findings are all `fixable_by_team: false`, stop and route to owner.
- If the validator still has errors after 3 rounds, pack status = `INVALID_PACK`. Say so plainly.
