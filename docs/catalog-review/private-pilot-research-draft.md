# Private ten-food pilot research draft

**Status:** research-only draft; not a candidate package, approval record, seed,
or publication input.

**Prepared:** 2026-08-06

This document records identity-level research that can be completed without
making a safety decision. It is intentionally not shaped as the import schema.
It must not be passed to the catalog import RPC.

## Source register

| Source ID                   | Publisher                          | Use in this draft                                                                  | Link                                                                                                                          |
| --------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `usda-fooddata-central`     | USDA Agricultural Research Service | Identity and taxonomy lookup only; not preparation, allergen, or storage approval. | [FoodData Central](https://fdc.nal.usda.gov/)                                                                                 |
| `cdc-infant-toddler`        | CDC                                | Background source for later qualified feeding and nutrition review.                | [Infant and Toddler Nutrition](https://www.cdc.gov/infant-toddler-nutrition/index.html)                                       |
| `who-complementary-feeding` | World Health Organization          | Background guideline for later qualified complementary-feeding review.             | [WHO Guideline for complementary feeding](https://www.who.int/publications/i/item/9789240081864)                              |
| `fda-food-allergies`        | FDA                                | Allergen-labeling context for later qualified allergy review.                      | [Food Allergies: What You Need to Know](https://www.fda.gov/food/buy-store-serve-safe-food/food-allergies-what-you-need-know) |
| `foodsafety-cold-storage`   | FoodSafety.gov                     | Storage/handling source for later qualified food-safety review.                    | [Cold Food Storage Chart](https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts)                             |
| `wcag-22`                   | W3C                                | Accessibility baseline when a visual is actually proposed.                         | [WCAG 2.2](https://www.w3.org/TR/WCAG22/)                                                                                     |

All sources were accessed on 2026-08-06. No numeric safety value from these
sources is copied into this draft.

## Candidate identity index

| Slot | Research identity | Non-safety research status                                         | Candidate-specific safety decision |
| ---- | ----------------- | ------------------------------------------------------------------ | ---------------------------------- |
| 01   | egg               | Identity requires reviewer-confirmed canonical label and category. | `PENDING_QUALIFIED_REVIEW`         |
| 02   | chicken           | Identity requires reviewer-confirmed canonical label and category. | `PENDING_QUALIFIED_REVIEW`         |
| 03   | black beans       | Identity requires reviewer-confirmed canonical label and category. | `PENDING_QUALIFIED_REVIEW`         |
| 04   | plain yogurt      | Identity requires reviewer-confirmed canonical label and category. | `PENDING_QUALIFIED_REVIEW`         |
| 05   | oatmeal           | Identity requires reviewer-confirmed canonical label and category. | `PENDING_QUALIFIED_REVIEW`         |
| 06   | sweet potato      | Identity requires reviewer-confirmed canonical label and category. | `PENDING_QUALIFIED_REVIEW`         |
| 07   | broccoli          | Identity requires reviewer-confirmed canonical label and category. | `PENDING_QUALIFIED_REVIEW`         |
| 08   | avocado           | Identity requires reviewer-confirmed canonical label and category. | `PENDING_QUALIFIED_REVIEW`         |
| 09   | banana            | Identity requires reviewer-confirmed canonical label and category. | `PENDING_QUALIFIED_REVIEW`         |
| 10   | pear              | Identity requires reviewer-confirmed canonical label and category. | `PENDING_QUALIFIED_REVIEW`         |

## Six-dimension state

For every candidate above, the current state for each dimension is
`PENDING_QUALIFIED_REVIEW`:

1. Feeding safety and developmental suitability
2. Allergy and restriction metadata
3. Nutrition and age/stage representation
4. Taxonomy and labeling
5. Storage and handling
6. Visual accessibility and rights, when applicable

The taxonomy/labeling rows may be refined by identity research, but no row is
eligible for import until the qualified packet supplies the required authority
reference, evidence location, review date, and deterministic decision. Visual
review stays conditional and must not be inferred from the identity alone.

## Explicit non-goals

- This draft does not select preparation methods, shapes, textures, serving
  instructions, cooking or reheating values, storage deadlines, or allergen
  restrictions.
- This draft does not create stable production IDs or candidate revisions.
- This draft does not satisfy Ticket 25 acceptance criteria.
- This draft does not authorize publication or make any parent-facing read
  eligible.

## Handoff

Use the existing `private-pilot-review-packet.md` and
`reviewer-authority.template.md` for qualified human decisions. A reviewer may
replace a pending state only with a source-backed, privacy-safe, durable record.
Until then, the production catalog remains empty and fail-closed.
