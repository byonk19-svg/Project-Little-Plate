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
- `pnpm exec vitest run src/modules/recipes/import-actions.test.ts`: 4 passed.
- `pnpm exec vitest run src/modules/recipes/planning-queries.test.ts`: 2 passed.
- `pnpm test:integration -- tests/integration/personal-recipes.test.ts`:
  repository integration runner completed 14 files / 95 tests passed,
  including personal recipe isolation, planning, and idempotency.
- `pnpm test:e2e -- tests/e2e/personal-recipes.spec.ts`: repository E2E runner
  completed 20 mobile Chromium tests passed, including personal recipe save,
  Week placement, and absence from Today/Kitchen.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed; recipe routes compiled.
- `pnpm supabase:reset`: passed with the new migration.
- `git diff --check`: passed.

## Remaining risks

- The link importer relies on public pages exposing structured recipe markup;
  blocked or unstructured sites fall back to editable manual fields.
- Hosted Supabase/Vercel promotion is intentionally not performed in this
  local implementation slice.
- Personal items are planning-only and do not yet derive inventory, storage,
  or serving work by design.
