# Private pilot evidence map (research only)

**Status:** source discovery for qualified human review; not production guidance,
not a catalog approval, and not a substitute for a reviewer sign-off.

**Date:** 2026-08-06

## Why this exists

The private ten-food pilot is blocked on a qualified, source-backed review
packet. This note maps public primary sources that a qualified reviewer can use
to assess the six review dimensions already defined by the project. It does
not copy safety values into the product, resolve disagreements between sources,
or make a preparation, allergen, nutrition, storage, or medical decision.

## Primary source map

| Review dimension                              | Public source owner and document                                                                                                                                                                                                                                                                | What it can support                                                                                                               | What still requires human judgment                                                                                                                                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feeding safety and developmental suitability  | [CDC: Foods and Drinks for 6 to 24 Month Olds](https://www.cdc.gov/infant-toddler-nutrition/foods-and-drinks/index.html) and [CDC: When, What, and How to Introduce Solid Foods](https://www.cdc.gov/infant-toddler-nutrition/foods-and-drinks/when-what-and-how-to-introduce-solid-foods.html) | A current public framework for developmental readiness, food/texture topics, and the scope of infant/toddler feeding information. | Whether a specific food/preparation is suitable for this product's target child, selected skills, and reviewed preparation variant; any conservative handling of uncertainty.                                                                                   |
| Feeding safety and developmental suitability  | [WHO Guideline for complementary feeding of infants and young children 6-23 months](https://www.who.int/publications/i/item/9789240081864)                                                                                                                                                      | A global, evidence-based guideline and its linked evidence summaries for complementary feeding.                                   | Applicability to this US-oriented product, a specific food, and a particular preparation or stage; the reviewer must document exclusions and conditions.                                                                                                        |
| Allergy and restriction metadata              | [FDA: Food Allergies: What You Need to Know](https://www.fda.gov/food/buy-store-serve-safe-food/food-allergies-what-you-need-know) and [FDA: What is a major food allergen?](https://www.fda.gov/industry/fda-basics-industry/what-major-food-allergen)                                         | The current federal labeling vocabulary and major-allergen reference context.                                                     | Clinical advice, individualized restrictions, cross-contact risk, reaction management, and whether a candidate's metadata is complete enough to publish. These must come from a qualified clinical/allergy reviewer and the product must not infer them.        |
| Nutrition and age/stage representation        | [WHO complementary feeding guideline](https://www.who.int/publications/i/item/9789240081864) and [CDC infant and toddler nutrition](https://www.cdc.gov/infant-toddler-nutrition/index.html)                                                                                                    | Public nutrition and age-band evidence to cite during review.                                                                     | Candidate-specific nutrient or stage claims, serving representation, and any claim that could be interpreted as medical or individualized nutrition advice. A qualified pediatric nutrition reviewer must approve the wording and scope.                        |
| Taxonomy and labeling                         | [USDA FoodData Central](https://fdc.nal.usda.gov/)                                                                                                                                                                                                                                              | A public identity and food-description reference that may help normalize names and labels.                                        | Canonical product taxonomy, synonym choice, package-label interpretation, and whether the normalized identity is faithful to the reviewed candidate. This is a content-governance decision, not an automatic import.                                            |
| Storage and handling                          | [FoodSafety.gov Cold Food Storage Chart](https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts) and [FoodSafety.gov: 4 Steps to Food Safety](https://www.foodsafety.gov/keep-food-safe/4-steps-to-food-safety)                                                                 | Public federal food-safety references for storage and handling review.                                                            | Whether a source applies to a particular infant preparation, container, thaw/reheat path, or saliva-exposure scenario; the reviewer must choose the applicable rule and document provenance. The app must continue to fail closed when that evidence is absent. |
| Visual accessibility and rights (conditional) | [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/)                                                                                                                                                                                                                                                   | A public accessibility baseline for meaningful non-text content and text alternatives.                                            | Whether a candidate image is meaningful, whether its alternative is equivalent, and whether the asset is licensed for the intended use. An accessibility reviewer and a rights/permission check are separate decisions; one cannot stand in for the other.      |

## What counts as human evidence for this project

For each candidate and applicable dimension, the reviewer packet should record:

- reviewer identity, role, and qualification evidence;
- the exact source, URL or document identifier, version/date, and relevant
  section;
- a qualified recommendation (`approved`, `approved with conditions`, or
  `not approved`), with the conditions stated in the reviewer's own words;
- unresolved questions, conflicts between sources, and the reason for any
  conservative exclusion; and
- review date, packet version, and reviewer sign-off.

The repository owner may adjudicate implementation choices and accepted
wording, but cannot replace a required qualified domain review or turn an
unreviewed source into a public safety claim.

## Reviewer recruitment gaps

The source map does not establish that the project has any qualified reviewer.
Before Ticket 25 can import the ten candidates, the project still needs:

1. a pediatric feeding/development reviewer (covering feeding safety and
   developmental suitability);
2. a pediatric nutrition reviewer (covering nutrition and age/stage claims);
3. an allergy-qualified clinical reviewer for allergen and restriction
   metadata;
4. a food-safety reviewer for preparation/storage/handling decisions; and
5. an accessibility reviewer plus an asset-rights owner when visuals apply.

One person may hold more than one role only if their qualifications and scope
are explicitly documented. Until those roles sign the structured packet, the
production catalog must remain empty and public reads must remain fail-closed.

## Next bounded step

Use this map to recruit or designate the reviewers, then have them complete the
existing `docs/catalog-review/private-pilot-review-packet.md` and its schemas.
Only after the packet is complete and qualified should Ticket 25 import exactly
ten candidates through the existing review/import gates. No source in this note
authorizes seed data or publication by itself.
