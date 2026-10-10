# Halal Certification Readiness Pack — Sambal Mak Embun

> Prepared by HalalPilot on **2026-10-10**. This is a **preparation pack**, not a certificate. It must be checked against the current requirements of the certifying authority before submission.
> Items marked **NEEDS_REVIEW** are gaps HalalPilot could not fill from your documents. It did not guess them.

## 1. Readiness at a glance

| | |
|---|---|
| Status | **NOT_READY** |
| Readiness score | **75 / 100** (computed by `validate_pack.py`, formula in Appendix C) |
| Blockers | **7** (4 ingredient traceability issues + 3 open CRITICAL audit findings) |
| Pack validation | **PASS**: 0 integrity errors |
| Mock audit | **PASS** after 1 review round; all findings are OWNER_ACTION |

**Do these first** (blocking, in order):

1. **Renew the Cili Kering Seri Wangi certificate** — it expired on 2026-07-31 and the invoice dated 2026-08-18 was bought after expiry [DOC-012] [DOC-020].
2. **Resolve the udang kering traceability gap** — buy from a supplier whose halal certificate matches the actual product, or get a certificate from Pemborong Hasil Laut Kuala for the bulk product [DOC-013] [DOC-021] [DOC-028].
3. **Obtain a halal certificate for Perisa Ayam Emas** — it contains chicken fat/powder and flavouring; replace it with a certified alternative if the supplier cannot provide slaughter-and-processing coverage [DOC-014] [DOC-015].
4. **Create and post SOP-03** — the cleaning and sanitation SOP is listed but the file is missing [DOC-022].
5. **Sign the halal policy and appoint an internal halal coordinator.**

## 2. Ingredient X-ray

| Product | Ingredient | Risk | Supplier | Certificate | Expiry | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| Sambal Bawang Garing (P1) | Bawang merah | LOW | Syarikat Rempah Seri Wangi | — | — | LOW_RISK_NO_CERT | [DOC-005] [DOC-012] |
| Sambal Bawang Garing (P1) | Minyak Masak Teratai | MEDIUM | Kilang Minyak Teratai | SAMPLE-JAKIM-KMT-1102-1180 | 2027-09-30 | VERIFIED | [DOC-005] [DOC-011] [DOC-016] |
| Sambal Bawang Garing (P1) | Cili kering Seri Wangi | MEDIUM | Syarikat Rempah Seri Wangi | SAMPLE-JAKIM-SW-1021-0457 | 2026-07-31 | **EXPIRED** | [DOC-005] [DOC-012] [DOC-020] |
| Sambal Bawang Garing (P1) | Gula halus Manis Jaya | MEDIUM | Kilang Minyak Teratai (distributor) | SAMPLE-JAKIM-GMJ-0911-0032 | 2027-12-31 | VERIFIED | [DOC-005] [DOC-011] [DOC-017] |
| Sambal Bawang Garing (P1) | Bawang putih | LOW | Syarikat Rempah Seri Wangi | — | — | LOW_RISK_NO_CERT | [DOC-005] [DOC-012] |
| Sambal Bawang Garing (P1) | Asam jawa Cap Pokok | MEDIUM | Syarikat Rempah Seri Wangi (distributor) | SAMPLE-JAIN-ACP-0715-0088 | 2027-05-31 | VERIFIED | [DOC-005] [DOC-012] [DOC-019] |
| Sambal Bawang Garing (P1) | Garam Bintang Laut | MEDIUM | Kilang Minyak Teratai (distributor) | SAMPLE-JAKIM-BLS-0809-0210 | 2028-02-28 | VERIFIED | [DOC-005] [DOC-011] [DOC-018] |
| Sambal Udang Kering (P2) | Bawang merah | LOW | Syarikat Rempah Seri Wangi | — | — | LOW_RISK_NO_CERT | [DOC-006] [DOC-012] |
| Sambal Udang Kering (P2) | Udang kering | MEDIUM | Pemborong Hasil Laut Kuala | SAMPLE-JAKIM-MLPT-1203-0661 (different holder/product) | 2028-04-14 | **MISMATCH** | [DOC-006] [DOC-013] [DOC-021] [DOC-028] |
| Sambal Udang Kering (P2) | Minyak Masak Teratai | MEDIUM | Kilang Minyak Teratai | SAMPLE-JAKIM-KMT-1102-1180 | 2027-09-30 | VERIFIED | [DOC-006] [DOC-011] [DOC-016] |
| Sambal Udang Kering (P2) | Cili kering Seri Wangi | MEDIUM | Syarikat Rempah Seri Wangi | SAMPLE-JAKIM-SW-1021-0457 | 2026-07-31 | **EXPIRED** | [DOC-006] [DOC-012] [DOC-020] |
| Sambal Udang Kering (P2) | Gula halus Manis Jaya | MEDIUM | Kilang Minyak Teratai (distributor) | SAMPLE-JAKIM-GMJ-0911-0032 | 2027-12-31 | VERIFIED | [DOC-006] [DOC-011] [DOC-017] |
| Sambal Udang Kering (P2) | Serai | LOW | Syarikat Rempah Seri Wangi | — | — | LOW_RISK_NO_CERT | [DOC-006] [DOC-012] |
| Sambal Udang Kering (P2) | Bawang putih | LOW | Syarikat Rempah Seri Wangi | — | — | LOW_RISK_NO_CERT | [DOC-006] [DOC-012] |
| Sambal Udang Kering (P2) | Asam jawa Cap Pokok | MEDIUM | Syarikat Rempah Seri Wangi (distributor) | SAMPLE-JAIN-ACP-0715-0088 | 2027-05-31 | VERIFIED | [DOC-006] [DOC-012] [DOC-019] |
| Sambal Udang Kering (P2) | Serbuk perisa ayam (Perisa Ayam Emas) | HIGH | Bekalan Bahan Makanan Cahaya | — | — | **NO_CERT** | [DOC-006] [DOC-014] [DOC-015] |
| Sambal Udang Kering (P2) | Garam Bintang Laut | MEDIUM | Kilang Minyak Teratai (distributor) | SAMPLE-JAKIM-BLS-0809-0210 | 2028-02-28 | VERIFIED | [DOC-006] [DOC-011] [DOC-018] |

**Verdict summary:** 8 VERIFIED · 5 LOW_RISK_NO_CERT · 2 EXPIRED · 1 MISMATCH · 1 NO_CERT.

### Messages to suppliers (drafts — review before sending)

**To Syarikat Rempah Seri Wangi (SR-01)** — expired chilli certificate

> Assalamualaikum. Kami Sambal Mak Embun sedang menyediakan permohonan pensijilan halal. Sijil halal SAMPLE-JAKIM-SW-1021-0457 untuk Cili Kering Seri Wangi telah tamat pada 31/07/2026. Boleh pihak tuan/puan kemukakan salinan sijil halal yang telah disemak semula? Terima kasih.

**To Pemborong Hasil Laut Kuala (SR-02)** — shrimp supplier/certificate mismatch

> Assalamualaikum. Kami Sambal Mak Embun membeli udang kering gred A (pukal) dari pihak tuan/puan pada 26/08/2026. Untuk permohonan pensijilan halal, kami memerlukan salinan sijil halal pembekal yang merangkumi udang kering pukal ini. Sekiranya tiada, bolehkah kami mendapatkan produk jenama Pantai Timur yang bersijil daripada pihak tuan/puan? Terima kasih.

**To Bekalan Bahan Makanan Cahaya (SR-03)** — uncertified chicken flavour powder

> Assalamualaikum. Kami Sambal Mak Embun sedang menyediakan permohonan pensijilan halal. Boleh pihak tuan/puan kemukakan (1) salinan sijil halal untuk Perisa Ayam Emas, dan (2) butiran pengilang serta negara asal? Maklumat ini diperlukan untuk mengesahkan status halal bahan ini. Terima kasih.

## 3. Process flows (DRAFT_FOR_OWNER)

### P1 — Sambal Bawang Garing

1. **Receiving ★** — Check invoice and packaging; verify halal certificate on every delivery against the approved ingredient list. [DOC-011] [DOC-012] [DOC-023]
2. **Storage ★** — Segregate certified from non-certified/pending ingredients; label every container; keep cleaning chemicals locked away. [DOC-024] [DOC-028]
3. **Preparation ★** — Use halal-dedicated equipment; verify ingredient identity and certificate status before use. [DOC-005] [DOC-023]
4. **Cooking** — Fry shallots; grind chilli and garlic; sauté paste; add tamarind, sugar and salt; fold in crispy shallots. [DOC-005]
5. **Filling and packing ★** — Hot-fill into sterilised jars and seal. **NEEDS_REVIEW**: recipe does not state the jar sterilisation method or validation record. [DOC-005]
6. **Labelling ★** — Apply labels; do not display any halal logo before certification; check batch code and allergen statement. [DOC-009]
7. **Storage and dispatch ★** — Keep finished products separate from raw materials and chemicals; maintain dispatch log with batch number. [DOC-024]

### P2 — Sambal Udang Kering

1. **Receiving ★** — Check invoice and packaging; verify halal certificate for every delivery, especially high-risk items (dried shrimp, chicken flavour powder). [DOC-013] [DOC-014] [DOC-023]
2. **Storage ★** — Segregate certified and non-certified ingredients; store high-risk items to prevent cross-contamination. [DOC-024] [DOC-028]
3. **Preparation ★** — Use halal-dedicated equipment; verify dried shrimp and flavour powder against approved certificates before use. [DOC-006] [DOC-023]
4. **Cooking ★** — Sauté paste; add dried shrimp, tamarind, sugar, salt and flavour powder; do not add any ingredient with unresolved halal status. [DOC-006]
5. **Filling and packing ★** — Hot-fill into sterilised jars and seal. **NEEDS_REVIEW**: recipe does not state the jar sterilisation method or validation record. [DOC-006]
6. **Labelling ★** — Apply labels; do not display any halal logo before certification; check batch code and crustacean allergen statement. [DOC-010]
7. **Storage and dispatch ★** — Keep finished products separate from raw materials and chemicals; maintain dispatch log. [DOC-024]

## 4. Procedures (DRAFT_FOR_OWNER)

**SOP-01 — Receiving and storage of ingredients**
- Check delivery against invoice for item, brand, code and quantity.
- Inspect packaging for damage, leaks, insects or contamination.
- Check halal certificate/logo on delivery; reject expired, mismatched or missing certificates.
- Record in the Receiving Log: date, supplier, item, code, quantity, certificate reference and receiver name.
- Place certified ingredients on clean racks; quarantine non-certified or pending items.
- Keep cleaning chemicals in a locked cabinet, separated from food.
- *Records:* Receiving Log, Approved Supplier List.

**SOP-02 — Cleaning and sanitation of equipment and premises**
- After each batch, clean equipment, tables and utensils with food-safe detergent and rinse.
- Sanitise food-contact surfaces with approved food-grade sanitiser; air dry.
- Clean floors and drains daily; remove residues and standing water.
- Post and complete a Cleaning Schedule with date, time and initials.
- Store cleaning chemicals in the locked BAHAN CUCI cabinet only.
- *Records:* Cleaning Schedule, Cleaning Log.

**SOP-03 — Preventing cross-contamination with non-halal substances**
- Use separate utensils/containers for certified vs non-certified ingredients until resolved.
- Do not process non-halal or unresolved ingredients on the same equipment at the same time as halal products.
- Clean and sanitise equipment between different products.
- Prohibit non-halal food, alcohol or unauthorised materials in the production area.
- Train staff to recognise high-risk ingredients and report concerns.
- *Records:* Training attendance record, cross-contamination risk review.

**SOP-04 — Traceability and record-keeping**
- Assign a unique batch number at the start of every production batch.
- Record batch number, product, quantity, date and staff on the Production Record.
- Record supplier, invoice number, certificate number and ingredient lot for every ingredient used.
- Link every jar label to the production batch number.
- Keep receiving logs, production records and certificates for the period required by the certifier.
- *Records:* Production Record, Ingredient Usage Log, Receiving Log.

**SOP-05 — Handling an ingredient whose certificate expires**
- Maintain a Certificate Expiry List with expiry dates for every certified ingredient.
- Review monthly and flag certificates expiring within 90 days.
- Contact the supplier for a renewed certificate before expiry.
- If not received by expiry, quarantine the ingredient and do not use it until valid evidence is obtained.
- Update the Approved Supplier List once the renewed certificate is verified.
- *Records:* Certificate Expiry List, Supplier Correspondence File, Quarantine Log.

## 5. Halal policy (draft for owner signature)

> Sambal Mak Embun is committed to producing halal products. We shall use only halal-certified or certifying-authority-approved ingredients, prevent cross-contamination with non-halal substances, maintain complete traceability records for every batch, and ensure all staff follow the approved halal procedures. This policy applies to all products, premises, equipment and personnel involved in production.

**Owner signature:** ________________________ **Date:** _______________

## 6. Missing documents checklist

| # | Document | Why | What you need to do | Blocking |
|---|---|---|---|---|
| D11 | Cleaning and sanitation procedure / schedule | SENARAI-SOP lists SOP-03 but the file is not in the folder [DOC-022] | Adopt and post the drafted SOP-02 cleaning and sanitation procedure; maintain Cleaning Schedule and Log | No |
| D12 | Halal policy statement signed by the owner | No signed halal policy in the folder | Review, sign and date the drafted policy; keep the signed copy | No |
| D13 | Internal halal control / person responsible for halal | No appointment or role description in the folder | Appoint a staff member as internal halal coordinator and document the role | No |

All blocking documents (D01–D10) are evidenced in the folder.

## 7. Mock audit result

| ID | Severity | Category | Issue | Status |
|---|---|---|---|---|
| F-01 | CRITICAL | Certificate | Cili kering Seri Wangi certificate expired 2026-07-31; purchased after expiry on 2026-08-18 | OWNER_ACTION |
| F-02 | CRITICAL | Traceability | Udang kering bought bulk/unbranded from Pemborong Hasil Laut Kuala but certificate belongs to different company and branded product | OWNER_ACTION |
| F-03 | CRITICAL | Risk ingredient | Perisa Ayam Emas contains chicken fat/powder and flavouring with no halal certificate or manufacturer details | OWNER_ACTION |
| F-04 | MAJOR | Procedure | SOP-03 cleaning file is listed but missing from the folder | OWNER_ACTION |
| F-05 | MINOR | Documentation | Halal policy not signed; no internal halal coordinator appointed | OWNER_ACTION |

**Audit verdict:** PASS (no team-fixable OPEN findings; all findings require owner/supplier action).

## Appendix A — Evidence register

| DOC-ID | Path | Type | Readable |
|---|---|---|---|
| DOC-001 | business/ssm-pendaftaran.txt | owner_note | Yes |
| DOC-002 | business/lesen-premis-mpkj.txt | certificate | Yes |
| DOC-003 | business/pelan-premis.txt | other | Yes |
| DOC-004 | staff/rekod-pengendali-makanan.txt | other | Yes |
| DOC-005 | recipes/resepi-sambal-bawang-garing.txt | recipe | Yes |
| DOC-006 | recipes/resepi-sambal-udang-kering.txt | recipe | Yes |
| DOC-007 | products/spesifikasi-sambal-bawang-garing.txt | other | Yes |
| DOC-008 | products/spesifikasi-sambal-udang-kering.txt | other | Yes |
| DOC-009 | products/label-sambal-bawang-garing.txt | other | Yes |
| DOC-010 | products/label-sambal-udang-kering.txt | other | Yes |
| DOC-011 | invoices/INV-KMT-0921.txt | invoice | Yes |
| DOC-012 | invoices/INV-SW-26-0815.txt | invoice | Yes |
| DOC-013 | invoices/INV-PHLK-3372.txt | invoice | Yes |
| DOC-014 | invoices/INV-BBMC-1188.txt | invoice | Yes |
| DOC-015 | invoices/spec-perisa-ayam-emas.txt | other | Yes |
| DOC-016 | certificates/sijil-halal-minyak-teratai.txt | certificate | Yes |
| DOC-017 | certificates/sijil-halal-gula-manis-jaya.txt | certificate | Yes |
| DOC-018 | certificates/sijil-halal-garam-bintang-laut.txt | certificate | Yes |
| DOC-019 | certificates/sijil-halal-asam-cap-pokok.txt | certificate | Yes |
| DOC-020 | certificates/sijil-halal-seri-wangi.txt | certificate | Yes |
| DOC-021 | certificates/sijil-halal-udang-kering.txt | certificate | Yes |
| DOC-022 | procedures/SENARAI-SOP.txt | other | Yes |
| DOC-023 | procedures/SOP-01-penerimaan-bahan.txt | other | Yes |
| DOC-024 | procedures/SOP-02-penyimpanan.txt | other | Yes |
| DOC-025 | procedures/SOP-04-kawalan-perosak.txt | other | Yes |
| DOC-026 | procedures/laporan-servis-kawalan-perosak.txt | other | Yes |
| DOC-027 | photos/01-ruang-memasak.jpg | photo | Yes |
| DOC-028 | photos/02-stor-kering.jpg | photo | Yes |

## Appendix B — Everything marked NEEDS_REVIEW

| # | About | Reason | Source |
|---|---|---|---|
| NR-01 | SOP-03 Pembersihan & sanitasi | SENARAI-SOP lists SOP-03 but the file is not present in the procedures folder; a cleaning and sanitation SOP is required | [DOC-022] |
| — | P1 Filling and packing step | Recipe states 'balang yang telah disteril' but does not state the sterilisation method or validation record | [DOC-005] |
| — | P2 Filling and packing step | Recipe states 'balang yang telah disteril' but does not state the sterilisation method or validation record | [DOC-006] |
| — | P2-I09 Serbuk perisa ayam | No halal certificate in the folder covers Perisa Ayam Emas; spec sheet states 'halal status: please refer to supplier' and manufacturer/country not stated | [DOC-006] [DOC-014] [DOC-015] |
| — | P2-I02 Udang kering | Certificate holder Syarikat Makanan Laut Pantai Timur and branded product do not match the invoice supplier Pemborong Hasil Laut Kuala or the bulk unbranded product actually purchased; store photo shows plain unbranded bag | [DOC-006] [DOC-013] [DOC-021] [DOC-028] |
| MD-01 | Cleaning and sanitation procedure / schedule (D11) | SOP-03 listed in SENARAI-SOP but file not present | [DOC-022] |
| MD-02 | Halal policy statement signed by owner (D12) | No signed halal policy in the folder | — |
| MD-03 | Internal halal control person (D13) | No appointment or role description in the folder | — |

## Appendix C — How the score is computed

```
100 * (0.6*ingredients + 0.15*process_steps + 0.25*documents)

Ingredient weights: VERIFIED=1, EXPIRING=0.75, LOW_RISK_NO_CERT=0.5, other=0
documents = 1 - blocking_missing/10

As of 2026-10-10:
- ingredients component = 0.618
- process_steps component = 0.857
- documents component = 1.0
- score = 75/100
```
