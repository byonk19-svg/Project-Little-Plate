# Current catalog inventory

Inventory snapshot: 2026-08-02. Paths are repository-relative. This is a
source inventory, not a claim that any record is production-ready.

## Summary

| Classification             | Source                                                                      | Foods | Preparations |                    Revisions | Sources | Tags | Storage rules | Visuals |
| -------------------------- | --------------------------------------------------------------------------- | ----: | -----------: | ---------------------------: | ------: | ---: | ------------: | ------: |
| Production/seed            | `supabase/seed.sql`                                                         |     0 |            0 |                            0 |       0 |    0 |             0 |       0 |
| Integration fixture family | `tests/integration/catalog-release-pipeline.test.ts` (`catalogFixture(50)`) |    50 |           50 |                           50 |       1 |    2 |            50 |       1 |
| Integration fixture        | `tests/integration/reviewed-content-foundation.test.ts` (`validFixture`)    |     1 |            6 |                            6 |       1 |    2 |             7 |       0 |
| Integration fixture        | `tests/integration/planner-generation.test.ts` (`fixture`)                  |     4 |            4 |                            4 |       1 |    2 |             4 |       0 |
| Integration fixture family | `tests/integration/feeding-eligibility.test.ts` (`baseFixture`)             |    16 |           17 |                           17 |       1 |    3 |            17 |       0 |
| Integration fixture        | `tests/integration/manual-meal-planning.test.ts`                            |     6 |            7 | 8 (approved, draft, retired) |       1 |    3 |             8 |       0 |
| Browser fixture family     | `tests/e2e/reviewed-foods.spec.ts`                                          |    59 |           59 |                           59 |       1 |    2 |            59 |       1 |
| Browser fixture            | `tests/e2e/manual-meal-planning.spec.ts`                                    |     4 |            4 |                            4 |       1 |    2 |             4 |       0 |
| Browser fixture            | `tests/e2e/feeding-eligibility.spec.ts`                                     |     1 |            1 |                            1 |       1 |    2 |             1 |       0 |

Generated families are counted at their declared invocation size; random UUID
suffixes are test-run identifiers, not stable production row IDs. Counts above
are source-definition counts, not concurrent database rows.

## Source-of-truth and schema locations

- `supabase/migrations/20260727183314_create_reviewed_content_foundation.sql`:
  `sources`, `tags`, `foods`, `preparations`, `content_revisions`,
  `revision_tags`, `storage_rules`, and `content_retirements`; the importer
  boundary and published read functions.
- `supabase/migrations/20260728073000_prepare_refrigerated_batch.sql`:
  reviewed storage-rule profiles and batch provenance.
- `src/modules/catalog/queries.ts`: the application read contract for food,
  preparation, tags, source metadata, storage rules, and visual rights.

## Representative records (values copied verbatim)

### Synthetic catalog pipeline food

- Repository path: `tests/integration/catalog-release-pipeline.test.ts`
- Record IDs: `food-ticket-17-${fixtureId}-0` through
  `food-ticket-17-${fixtureId}-49`
- Record type: food; classification: integration test fixture
- Existing value: `name = Synthetic catalog food 00`; `slug =
food-ticket-17-${fixtureId}-0`; `category = synthetic-fruit` (even indexes)
  or `synthetic-vegetable` (odd indexes).
- Provenance: revision points to `source-ticket-17-${fixtureId}` whose value is
  `Synthetic catalog pipeline source` at `https://example.test/ticket-17`.
- Missing/unsupported: source and reviewer are synthetic; no qualified
  authority or evidence is recorded. Nutrition and age/stage fields are not
  represented in the fixture or catalog tables.

### Synthetic supported preparation revision

- Repository path: `tests/integration/reviewed-content-foundation.test.ts`
- Record ID: `revision-test-supported-v1`; preparation `prep-test-supported`;
  food `food-test-001`; rule IDs `rule-test-discard` and `rule-test-quality`.
- Existing value: `method = TEST FIXTURE METHOD`; `shape_texture = TEST
FIXTURE TEXTURE`; `preparation_time_band = under_15_minutes`; storage
  guidance values are `TEST FIXTURE DISCARD GUIDANCE` and `TEST FIXTURE QUALITY
GUIDANCE`.
- Provenance: `source-test-001` / `Synthetic fixture source`; reviewer role
  `synthetic_test_reviewer`; reviewed `2026-07-27`.
- Missing/unsupported: all values are explicitly synthetic test data; no
  qualified review reference, nutrition field, or age/stage field exists.

### Browser scale fixture

- Repository path: `tests/e2e/reviewed-foods.spec.ts`
- Record IDs: `food-e2e-scale-0` … `food-e2e-scale-57`, plus `food-e2e-001`;
  corresponding `prep-e2e-scale-*` and `revision-e2e-scale-*` IDs.
- Existing value: names are `Synthetic Scale Food 00` … `Synthetic Scale Food
57`; categories alternate `test-fruit` and `test-vegetable`.
- Provenance: `source-e2e-001`, `Synthetic browser fixture source`,
  `https://example.test/browser-source`; reviewer role is
  `synthetic_browser_reviewer`.
- Missing/unsupported: test-only source and reviewer; no qualified approval,
  nutrition model, or age/stage content.

## Traceability limits

No committed production row can currently be inventoried because the seed is
empty and all catalog records are created by test fixtures at runtime. No
stable production food IDs, reviewer approval references, qualified source
list, nutrition representation, or age/stage representation were found.
These are gaps for review and owner adjudication, not permission to invent
values.
