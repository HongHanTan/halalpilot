# Demo dataset: Sambal Mak Embun (fictional)

**Point HalalPilot at `demo_dataset/sambal-mak-embun/` only.** This answer key sits outside that
folder on purpose, so the agents can't read it.

Every business, person, supplier, address and certificate number is invented. Every certificate,
licence and registration is marked **SAMPLE** and is not a real JAKIM, JAIN, SSM or council document.

## The business

A home-based sambal maker in Kajang, Selangor, with three Muslim staff. The production kitchen is a
separate annex behind the house. The owner is organised: registration, licence, floor plan, staff
records and pest control are all in place. The only problems are the four planted issues below.

| Product | Code | Ingredients |
|---|---|---|
| Sambal Bawang Garing 200g | SME-SBG-200 | 7: shallots, palm oil, dried chilli, sugar, garlic, tamarind, salt |
| Sambal Udang Kering 200g | SME-SUK-200 | 10: the same 7 plus dried shrimp, lemongrass, chicken flavour powder |

Folder: `business/` (SSM, premise licence, floor plan) · `staff/` (typhoid and training records) ·
`products/` (specs and label text) · `recipes/` · `invoices/` (4 invoices + 1 spec sheet) ·
`certificates/` (6) · `procedures/` (SOP index, 3 SOPs, pest-control report) · `photos/` (2)

## The four planted issues

| # | Issue | Where | What HalalPilot must report |
|---|---|---|---|
| 1 | **Expired certificate** | `sijil-halal-seri-wangi.txt` expired **31/07/2026**. The dried chilli on invoice SW-26-0815 (18/08/2026) was bought after it expired | Cili kering `EXPIRED` in **both** products, CRITICAL, plus a renewal request to Syarikat Rempah Seri Wangi |
| 2 | **Supplier mismatch** | Dried shrimp invoice INV-PHLK-3372 is from *Pemborong Hasil Laut Kuala*: bulk, unbranded, "diproses sendiri". The only shrimp certificate belongs to a different company, *Syarikat Makanan Laut Pantai Timur*, for its own **branded packs**. The store photo shows a plain unbranded bag | Udang kering `MISMATCH`: the certificate does not cover the supplier or the product actually bought. The team must not accept it just because the word "udang kering" matches |
| 3 | **Risky ingredient** | *Perisa Ayam Emas* chicken flavour powder (INV-BBMC-1188, spec sheet): contains **chicken fat and chicken powder**, manufacturer and country not stated, "halal status: please refer to supplier", no certificate in the folder | Serbuk perisa ayam `HIGH` risk, `NO_CERT`, CRITICAL. Meat-derived, so it needs a certificate covering slaughter and processing. Suggest a certified alternative in generic terms only |
| 4 | **Missing procedure** | `SENARAI-SOP.txt` lists **SOP-03 Pembersihan & sanitasi**, but there is no SOP-03 file, and the kitchen photo shows only SOP-01, 02 and 04 on the wall | Process Builder / Auditor flag the missing cleaning and sanitation procedure and draft one as `DRAFT_FOR_OWNER`. It must not claim one exists |

## Expected ingredient verdicts (for runs between 2026-10-10 and 2027-02-28)

| Ingredient | Supplier / invoice | Certificate | Expected verdict |
|---|---|---|---|
| Cili kering Seri Wangi | Rempah Seri Wangi / SW-26-0815 | SAMPLE-JAKIM-SW-1021-0457, exp 2026-07-31 | **EXPIRED** |
| Minyak Masak Teratai | Kilang Minyak Teratai / KMT/INV/2026/0921 | exp 2027-09-30 | VERIFIED |
| Gula Halus Manis Jaya | Kilang Minyak Teratai (distributor) / same invoice | holder Kilang Gula Manis Jaya (brand owner), exp 2027-12-31 | VERIFIED |
| Garam Halus Bintang Laut | Kilang Minyak Teratai (distributor) / same invoice | holder Bintang Laut Salt Industries (brand owner), exp 2028-02-28 | VERIFIED |
| Asam jawa Cap Pokok | Rempah Seri Wangi (distributor) / SW-26-0815 | holder Perusahaan Asam Cap Pokok (brand owner), exp 2027-05-31 | VERIFIED |
| Bawang merah, bawang putih, serai | Rempah Seri Wangi / SW-26-0815 | none (fresh produce) | LOW_RISK_NO_CERT |
| Udang kering | Pemborong Hasil Laut Kuala / 3372 | Pantai Timur cert (different company and product) | **MISMATCH** |
| Serbuk perisa ayam (Perisa Ayam Emas) | Bekalan Bahan Makanan Cahaya / BBMC-1188 | none | **NO_CERT, HIGH** |

Rows for distributors selling a branded product (sugar, salt, tamarind) are **not** mismatches. A
certificate held by the brand owner is the normal case. A good run tells this apart from issue #2.

## Things that should NOT be flagged as missing

SSM registration, premise licence, floor plan, typhoid and food-handler training records,
pest-control procedure and service report, receiving and storage SOPs, and product labels (no halal
logo, which is correct before certification). A halal policy statement and an internal halal
control person are not in the folder. Drafting them is fine, but they are not planted issues.

## Expected outcome

- Validator: `PASS` (0 integrity errors).
- Readiness: **`NOT_READY`**. Blockers: cili kering ×2, udang kering, perisa ayam, and the open CRITICAL findings.
- Score: about **70–77 / 100**, depending on how many process steps the team marks `NEEDS_REVIEW`.
  There are no blocking missing documents, so the documents component should be 1.0.
- Supplier request drafts: Seri Wangi (renewed chilli cert), Pemborong Hasil Laut Kuala (their own
  cert, or buy the certified Pantai Timur brand), Bekalan Bahan Makanan Cahaya (halal cert plus
  manufacturer details for Perisa Ayam Emas).
- Every certificate gets an action to verify it in the official halal directory, because all of them are marked SAMPLE.
