# Personal Recipe Planning Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with test-first
> slices. Keep the safety boundary intact: personal items never become reviewed
> catalog content or Today/Kitchen work.

**Goal:** Add a private household recipe library, public-link extraction with
editable review, and Week placement for personal recipes.

**Architecture:** Personal recipes and personal planning items use separate
tables and RPCs from reviewed catalog meals. A pure extractor turns HTML into
an editable preview; server actions validate public HTTPS URLs and persist only
caregiver-confirmed fields. Week merges personal items into its read model,
while Today, Kitchen, serving, storage, and eligibility remain unchanged.

**Tech Stack:** Next.js App Router, React server actions, TypeScript, Supabase
Postgres migrations/RPCs/RLS, Vitest, real-Supabase integration tests, and
Playwright.

---

### Task 1: Add the private recipe data boundary

**Files:**
- Create: `supabase/migrations/20260810100000_personal_recipe_library.sql`
- Create: `src/modules/recipes/domain.ts`
- Create: `src/modules/recipes/queries.ts`
- Create: `src/modules/recipes/actions.ts`
- Create: `src/modules/recipes/form-state.ts`
- Test: `src/modules/recipes/domain.test.ts`
- Test: `tests/integration/personal-recipes.test.ts`

- [ ] **Step 1: Write the domain tests first**

Cover title/ingredient/instruction normalization, public HTTPS URL validation,
source-type validation, and rejection of blank required fields. Assert that a
personal recipe payload contains no reviewed-preparation or eligibility fields.

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run: `pnpm exec vitest run src/modules/recipes/domain.test.ts`
Expected: FAIL because the recipes domain module does not yet exist.

- [ ] **Step 3: Implement the pure domain normalization**

Define `PersonalRecipeDraft` with `title`, `ingredients`, `instructions`,
`notes`, `sourceUrl`, `sourceType`, and `extractionMethod`. Normalize line
endings and trim fields; accept only `https://` URLs with a public hostname;
return explicit validation errors instead of throwing.

- [ ] **Step 4: Run the focused domain test**

Run: `pnpm exec vitest run src/modules/recipes/domain.test.ts`
Expected: PASS for every normalization and validation case.

- [ ] **Step 5: Add the SQL boundary**

Create household-owned `personal_recipes` and `personal_planning_items` tables
with RLS policies for authenticated household caregivers, service-role grants,
foreign keys to `households`, `babies`, and `auth.users`, unique planning rows
per baby/date/slot/recipe, and cascade deletion. Add security-definer RPCs:
`list_personal_recipes`, `get_personal_recipe`, `create_personal_recipe`,
`update_personal_recipe`, `delete_personal_recipe`,
`list_personal_planning_items`, and `plan_personal_recipe`. RPCs must verify
the caller's household and active baby; no RPC may call eligibility or reviewed
publication functions.

- [ ] **Step 6: Add integration tests against real Supabase**

Prove household isolation, anonymous denial, create/update/delete lifecycle,
duplicate planning idempotency, date/slot validation, cascade deletion, and
that personal rows do not appear in catalog or eligibility RPC results.

- [ ] **Step 7: Run the integration slice**

Run: `pnpm test:integration -- tests/integration/personal-recipes.test.ts`
Expected: PASS after a clean local reset.

- [ ] **Step 8: Commit the data boundary**

Run:
```bash
git add supabase/migrations/20260810100000_personal_recipe_library.sql src/modules/recipes tests/integration/personal-recipes.test.ts
git commit -m "feat: add private personal recipe boundary"
```

### Task 2: Build the server-side recipe-link extractor

**Files:**
- Create: `src/modules/recipes/extractor.ts`
- Create: `src/modules/recipes/extractor.test.ts`
- Create: `src/modules/recipes/import-actions.ts`
- Create: `src/modules/recipes/import-form-state.ts`

- [ ] **Step 1: Write parser tests first**

Test JSON-LD `Recipe` objects, `@graph`, arrays, ingredient arrays, instruction
arrays/HowToStep objects, HTML `itemprop` fallback, metadata preview fallback,
malformed JSON-LD, missing required fields, and explicit extraction methods.

- [ ] **Step 2: Run parser tests and verify failure**

Run: `pnpm exec vitest run src/modules/recipes/extractor.test.ts`
Expected: FAIL because the extractor does not exist.

- [ ] **Step 3: Implement pure HTML extraction**

Parse only the allowed structured forms with bounded string lengths. Never
interpret recipe text as safety guidance. Return `{status:"ready", preview}` or
`{status:"incomplete", preview, missing}` with `extractionMethod`.

- [ ] **Step 4: Run parser tests and verify green**

Run: `pnpm exec vitest run src/modules/recipes/extractor.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement safe public fetch action**

Accept one URL, require `https:`, reject credentials/ports/local/private IP
hosts, send no cookies, follow at most three redirects while revalidating each
destination, enforce a short timeout and response-size cap, require HTML, and
return a review payload without persisting it. Normalize fetch failures into
user-facing retry/manual-entry states.

- [ ] **Step 6: Add action tests**

Use a dependency-injected fetcher to prove URL rejection, redirect recheck,
size/content-type/timeout failures, and successful extraction without database
writes.

- [ ] **Step 7: Commit the extractor**

Run:
```bash
git add src/modules/recipes/extractor.ts src/modules/recipes/extractor.test.ts src/modules/recipes/import-actions.ts src/modules/recipes/import-form-state.ts
git commit -m "feat: extract public recipe links safely"
```

### Task 3: Add recipe library and editable import UI

**Files:**
- Create: `src/app/recipes/page.tsx`
- Create: `src/app/recipes/new/page.tsx`
- Create: `src/app/recipes/import/page.tsx`
- Create: `src/app/recipes/[id]/page.tsx`
- Create: `src/app/recipes/recipe-form.tsx`
- Create: `src/app/recipes/import-form.tsx`
- Modify: `src/components/navigation/primary-navigation.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/e2e/personal-recipes.spec.ts`

- [ ] **Step 1: Add the failing browser test**

Create a household recipe manually, verify the list and detail page show the
not-reviewed label, import a fixture public recipe page through the review
screen, edit one field, save it, and verify the source URL and extraction
method are displayed.

- [ ] **Step 2: Run the browser test and verify failure**

Run: `pnpm test:e2e -- tests/e2e/personal-recipes.spec.ts`
Expected: FAIL because the recipes routes do not exist.

- [ ] **Step 3: Implement the routes and forms**

Use server actions for create/update/delete. Keep extracted values in the
review form until submit. Render required-field errors inline, source URL as a
link, and the exact `Personal recipe — not reviewed` warning on every detail
and planning surface.

- [ ] **Step 4: Run the browser test and verify green**

Run: `pnpm test:e2e -- tests/e2e/personal-recipes.spec.ts`
Expected: PASS.

### Task 4: Add any-day weekly planning for personal items

**Files:**
- Create: `src/modules/recipes/planning-actions.ts`
- Create: `src/modules/recipes/planning-queries.ts`
- Create: `src/app/recipes/[id]/planning-form.tsx`
- Modify: `src/app/week/page.tsx`
- Modify: `src/modules/meals/queries.ts`
- Modify: `src/app/globals.css`
- Test: `src/modules/recipes/planning-queries.test.ts`
- Test: `tests/integration/personal-recipes.test.ts`
- Test: `tests/e2e/personal-recipes.spec.ts`

- [ ] **Step 1: Add transport tests first**

Prove malformed personal planning rows are rejected and valid rows preserve
household recipe identity, local date, configured slot, and not-reviewed state.

- [ ] **Step 2: Run the transport test and verify failure**

Run: `pnpm exec vitest run src/modules/recipes/planning-queries.test.ts`
Expected: FAIL until the parser exists.

- [ ] **Step 3: Implement Week read/write seams**

Load personal items for the requested seven-day window and render them in the
matching day/slot without changing reviewed meal components, planner scoring,
or Today/Kitchen RPCs. The placement form must offer only the configured slots
and dates in the current Week window. A personal item must never be submitted
to `plan_preparation_for_tomorrow` or any serving/storage action.

- [ ] **Step 4: Run focused tests**

Run:
```bash
pnpm exec vitest run src/modules/recipes/planning-queries.test.ts
pnpm test:integration -- tests/integration/personal-recipes.test.ts
pnpm test:e2e -- tests/e2e/personal-recipes.spec.ts
```
Expected: PASS, with personal items visible in Week and absent from Today and
Kitchen.

- [ ] **Step 5: Commit the planning slice**

Run:
```bash
git add src/modules/recipes src/app/recipes src/app/week/page.tsx src/modules/meals/queries.ts src/app/globals.css tests
git commit -m "feat: plan personal recipes across the week"
```

### Task 5: Verify and review the complete slice

- [ ] **Step 1: Run repository checks**

Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm test:catalog-sources`, `pnpm build`, `pnpm verify:database`,
`pnpm test:integration`, `pnpm test:e2e`, `node scripts/check-whitespace.mjs`,
and `git diff --check`.

- [ ] **Step 2: Inspect safety-sensitive call paths**

Confirm no personal recipe identifier is accepted by reviewed-content RPCs,
feeding eligibility, Today, Kitchen, batch, or serving paths, and confirm
anonymous catalog reads remain unchanged.

- [ ] **Step 3: Perform the two-axis review**

Review the diff for standards and spec correctness, resolve every concrete
finding, and rerun affected tests.

- [ ] **Step 4: Record evidence and final status**

Update the active issue with exact commands/results, changed artifacts,
fixture status, and remaining risks. Do not claim hosted deployment or real
recipe content until explicitly promoted.
