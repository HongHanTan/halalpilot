# Business-level document checklist (typical; confirm with the certifier)

Items a small-food-business halal application **typically** asks for. Requirements vary by
scheme (for example, Malaysia's MYeHALAL / JAKIM and state authorities), product category and
company size. Every item becomes either a matched document (`source: DOC-xxx`) or a
`missing_documents` entry with `status: NEEDS_REVIEW`.

| ID | Document | Blocking? | Notes |
|---|---|---|---|
| D01 | Business registration (e.g. SSM certificate) | yes | Name and address must match the application |
| D02 | Premise licence / local-authority food premise permit | yes | Home-based businesses: confirm local rules |
| D03 | Product list with recipe or formulation per product | yes | Built from recipes |
| D04 | Ingredient list with supplier and halal certificate per ingredient | yes | The ingredient matrix |
| D05 | Valid halal certificate (or acceptable declaration) for every ingredient | yes | From the ingredient matrix |
| D06 | Process flow chart per product | yes | Process Builder drafts |
| D07 | Premise layout / floor plan showing production and storage areas | yes | Owner must draw or approve |
| D08 | Food-handler typhoid vaccination record, all handlers | yes | Malaysian requirement for food handlers |
| D09 | Food-handler hygiene training certificate, all handlers | yes | |
| D10 | Pest-control record or procedure | yes | |
| D11 | Cleaning and sanitation procedure / schedule | no | SOP draft acceptable for preparation |
| D12 | Halal policy statement signed by the owner | no | Process Builder drafts |
| D13 | Internal halal control / person responsible for halal | no | Requirement depends on company size |
| D14 | Muslim worker details, if required for the category | no | Confirm requirement |
| D15 | Product labels / packaging artwork | no | Must not show a halal logo before certification |
| D16 | Traceability: receiving and storage records | no | SOP draft acceptable |

"Blocking" means the readiness pack cannot be `READY` while the item is missing.
