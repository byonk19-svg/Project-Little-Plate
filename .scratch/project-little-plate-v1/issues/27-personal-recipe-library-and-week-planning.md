# 27 - Personal recipe library and weekly planning

**Status:** implementation complete locally; hosted promotion not started

**Goal:** Give a household a private place to save foods and recipes, import a
public recipe link with an editable extraction review, and place personal
items on any current-week day and configured meal slot without letting them
enter reviewed safety or serving workflows.

## Decisions

- Personal recipes are household-owned and private.
- Manual recipes and public HTTPS recipe links are supported.
- Link extraction prefers Recipe JSON-LD, then itemprop markup, then a metadata
  preview. The caregiver edits and confirms fields before persistence.
- Personal planning items are separate from reviewed meal components.
- Week shows a clear `Personal recipe — not reviewed` label.
- Today, Kitchen, serving, storage, eligibility, and public catalog reads do
  not consume personal items.
- Recipe pages are not copied wholesale; the saved source URL remains visible.

## Changed artifacts

- `CONTEXT.md`
- `docs/superpowers/specs/2026-08-10-personal-recipe-planning-design.md`
- `docs/superpowers/plans/2026-08-10-personal-recipe-planning.md`
- `supabase/migrations/20260810100000_personal_recipe_library.sql`
- `src/modules/recipes/`
- `src/app/recipes/`
- `src/app/week/page.tsx`
- `src/components/navigation/destinations.ts`
- `src/app/globals.css`
- `tests/integration/personal-recipes.test.ts`
- `tests/e2e/personal-recipes.spec.ts`

## Validation evidence

- `pnpm exec vitest run src/modules/recipes/domain.test.ts`: 8 passed.
- `pnpm exec vitest run src/modules/recipes/extractor.test.ts`: 5 passed.
- `pnpm exec vitest run src/modules/recipes/import-actions.test.ts`: 5 passed.
- `pnpm exec vitest run src/modules/recipes/planning-queries.test.ts`: 2 passed.
- `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/personal-recipes.test.ts`:
  focused real-Supabase integration completed 1 file / 4 tests passed,
  including baby-ID scoping, URL persistence rejection, and idempotency.
- `pnpm test:integration`:
  repository integration runner completed 14 files / 96 tests passed,
  including personal recipe isolation, planning, and idempotency.
- `pnpm exec playwright test tests/e2e/personal-recipes.spec.ts --grep "household can save"`:
  focused browser test passed with the corrected field label.
- `pnpm test:e2e`: repository E2E runner completed 20 mobile Chromium tests
  passed, including personal recipe save,
  Week placement, and absence from Today/Kitchen.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm test`: 22 files / 157 tests passed.
- `pnpm test:catalog-sources`: 6 checks passed.
- `pnpm build`: passed; recipe routes compiled.
- `pnpm supabase:reset`: passed with the new migration.
- `pnpm exec supabase db lint --local --fail-on warning`: passed with no schema
  errors.
- `pnpm format:check`: passed.
- `node scripts/check-whitespace.mjs`: passed.
- `git diff --check`: passed.
- `pnpm verify`: not claimed as composite evidence because the local composite
  runner exited nonzero while the constituent stages were being rerun; the
  formatting, lint, typecheck, unit, catalog-source, build, database reset,
  database lint, integration, and E2E stages are recorded independently above.

## Remaining risks

- The link importer relies on public pages exposing structured recipe markup;
  blocked or unstructured sites fall back to editable manual fields.
- Personal items are planning-only and do not yet derive inventory, storage,
  or serving work by design.
- Hosted Supabase/Vercel promotion remains intentionally out of scope for this
  local implementation slice.
