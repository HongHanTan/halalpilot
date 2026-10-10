# Sample cases

## `kedai-sambal-contoh/` — fictional home-based sambal maker

This file sits **outside** the case folder on purpose: it lists the planted answers, and the
agents must not see it.

Every business, supplier, certificate number and person in this folder is invented for
testing HalalPilot. None of the certificates are real JAKIM documents.

The case folder is laid out the way an owner would drop it in: unsorted, in a mix of Malay and English.
The gaps below are deliberate. A correct HalalPilot run must find **all** of them and
must **not** paper over any:

| # | Planted gap | Expected HalalPilot outcome |
|---|---|---|
| 1 | Belacan certificate expired 2026-08-31 | `EXPIRED`, CRITICAL, draft renewal request to supplier |
| 2 | Cooking-oil certificate expires 2026-11-20 (< 90 days from 2026-10-10) | `EXPIRING`, renewal reminder |
| 3 | Flavour cert covers `SF-200`, invoice is for `SF-210` | `MISMATCH`, NEEDS_REVIEW |
| 4 | Emulsifier E471 (high-risk, possibly animal-derived) has no certificate | `NO_CERT`, HIGH risk, CRITICAL |
| 5 | Ikan bilis bought at the pasar, no invoice and no cert | supplier `NEEDS_REVIEW` |
| 6 | Unlabelled tub visible in store photo | observation → NEEDS_REVIEW |
| 7 | `photo-03` is too blurred to read | `readable: false`, nothing extracted from it |
| 8 | No SSM registration, typhoid records, premise layout or pest-control record | listed in missing documents |

Run date used for expected outcomes: **2026-10-10**.
