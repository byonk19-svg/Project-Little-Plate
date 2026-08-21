# Plan: Recipe Platform Follow-Through

**Generated**: 2026-08-12  
**Estimated Complexity**: Medium

## Overview

The personal recipe platform is already merged to `main` and the working tree
is clean. The next work should close the gap between successful manual
dogfooding and durable repository confidence, then remove documentation drift,
and finally tighten the boundary around retained legacy implementation.

The sequence is intentional:

1. Prove the highest-value user workflow: importing recipes from a website.
2. Make the written product contract agree with the shipped behavior.
3. Isolate or remove only legacy code that is demonstrably unused, while
   preserving historical migrations and the explicit legacy verification path.

## Prerequisites

- Work from a clean checkout of `main`.
- Keep the active product contract in `AGENTS.md`, `CONTEXT.md`, `README.md`,
  and ADR 0019/0020 as the source of truth.
- Do not use live recipe websites as the only automated test dependency.
- Do not copy imported source images without an explicit confirmation in the
  test flow and product UI.
- Do not delete legacy migrations or weaken the SSRF, household-RLS, or image
  confirmation boundaries.

## Sprint 1: Lock down recipe import in the browser

**Goal**: Make the primary import workflow repeatable and verifiable on the
mobile browser path without depending on a live third-party website.

**Demo/Validation**:

- A mobile Playwright run signs in, imports a deterministic recipe page, edits
  the preview, saves it, and sees the source attribution in the recipe detail.
- A multi-recipe article fixture lets the user select only some recipes.
- A suggested image remains unchecked until the user explicitly confirms it.
- Duplicate and incomplete-import paths remain recoverable and do not create
  partial records.

### Task 1.1: Define deterministic import fixtures

- **Location**: `tests/e2e/support/`, `tests/fixtures/`, and the import test
  configuration as needed.
- **Description**: Add stable HTML fixtures representing a JSON-LD single
  recipe, a clearly structured multi-recipe article with image suggestions,
  and an incomplete page. Use a test-only transport seam or fixture server;
  production URL validation must continue to reject private destinations.
- **Dependencies**: None.
- **Acceptance Criteria**:
  - Fixtures contain no live-site dependency.
  - The production SSRF, redirect, content-type, timeout, and body-size
    checks remain active for normal imports.
  - The fixture mechanism cannot be enabled accidentally in a non-test
    environment.
- **Validation**: Focused parser and transport tests, plus a review of the
  test-only configuration boundary.

### Task 1.2: Add single-recipe import browser coverage

- **Location**: `tests/e2e/recipe-platform.spec.ts` and related support helpers.
- **Description**: Extend the existing mobile workflow to open
  `/recipes/import`, submit a deterministic single-recipe URL, verify editable
  extracted fields, change at least one field, save, and verify the resulting
  recipe detail and source link.
- **Dependencies**: Task 1.1.
- **Acceptance Criteria**:
  - The test proves preview-before-save behavior.
  - The test proves edited values, not only scraped defaults, are persisted.
  - No incomplete recipe is visible after a failed save or failed import.
- **Validation**: `pnpm exec playwright test tests/e2e/recipe-platform.spec.ts`.

### Task 1.3: Add multi-recipe, duplicate, and fallback coverage

- **Location**: `tests/e2e/recipe-platform.spec.ts`,
  `tests/integration/personal-recipes.test.ts`, and import support fixtures.
- **Description**: Cover selecting a subset of recipes from an article,
  re-importing a matching source, choosing the existing recipe, explicitly
  requesting a separate copy, and falling back to manual entry when a page
  lacks complete details.
- **Dependencies**: Tasks 1.1 and 1.2.
- **Acceptance Criteria**:
  - New recipes are selected by default; duplicate matches are not silently
    overwritten or saved.
  - Explicit separate-copy behavior is distinguishable from the default
    duplicate outcome.
  - Failed extraction preserves a manual-save path and creates no partial row.
- **Validation**: Focused Playwright and Supabase integration tests.

### Task 1.4: Verify explicit imported-image confirmation

- **Location**: `tests/e2e/recipe-platform.spec.ts`,
  `src/app/recipes/import/`, and image integration coverage only if a defect is
  found.
- **Description**: In the multi-recipe fixture, assert that the suggested
  image is visible but unchecked, then confirm one image and verify that only
  that recipe receives image metadata. Verify the unselected recipe remains
  text-only.
- **Dependencies**: Tasks 1.1 and 1.3.
- **Acceptance Criteria**:
  - Images are never copied merely because a source page suggested them.
  - Confirmed image metadata remains household-scoped and attached to the
    selected recipe.
  - Image failure does not prevent the recipe itself from being saved.
- **Validation**: Focused browser test plus image RLS integration test.

### Task 1.5: Close Sprint 1 with the active verification gate

- **Location**: No product source change unless earlier tasks expose a defect.
- **Description**: Run the focused import tests, then the repository-defined
  active gate and record any discovered limitations before moving on.
- **Dependencies**: Tasks 1.1–1.4.
- **Acceptance Criteria**:
  - Import browser coverage is green on the mobile project.
  - Existing manual recipe, Week, Today, Kitchen, privacy, and image coverage
    remains green.
- **Validation**:
  - `pnpm format:check`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm test:integration`
  - `pnpm build`
  - `pnpm test:e2e`
  - `git diff --check`

## Sprint 2: Reconcile product documentation

**Goal**: Remove contradictory or stale planning language so future work is
guided by the shipped personal recipe platform rather than the superseded
design.

**Demo/Validation**: A new contributor can read the active docs and determine
that personal recipes support manual entry, URL import, Week planning, Today,
Kitchen notes, search, favorites, source attribution, and optional images;
inventory, safety review, automatic planning, and public sharing are absent.

### Task 2.1: Mark the superseded design accurately

- **Location**: `docs/superpowers/specs/2026-08-10-personal-recipe-planning-design.md`.
- **Description**: Replace the obsolete statements that personal recipes are
  excluded from Today and Kitchen with the current contract, or mark the
  document explicitly superseded and link to `CONTEXT.md` and ADR 0019.
  Preserve useful import and privacy decisions without presenting stale flows
  as active requirements.
- **Dependencies**: Sprint 1 product behavior is confirmed.
- **Acceptance Criteria**:
  - The document no longer contradicts `CONTEXT.md` or the shipped routes.
  - It clearly identifies historical decisions versus active requirements.
- **Validation**: Repository-wide search for the contradicted exclusion terms.

### Task 2.2: Update the implementation-plan status

- **Location**: `docs/superpowers/plans/personal-recipe-platform-pivot-plan.md`.
- **Description**: Change the old branch-specific status to the actual merged
  state and replace the generic remaining-cleanup paragraph with links to this
  follow-through plan.
- **Dependencies**: Task 2.1.
- **Acceptance Criteria**:
  - No active plan claims that implementation is only on the old feature
    branch.
  - Remaining work is explicitly split into import coverage, documentation,
    and legacy isolation.
- **Validation**: `rg` checks for stale branch/status claims.

### Task 2.3: Add a short active-vs-legacy navigation note

- **Location**: `README.md`, `CONTEXT.md`, or a small ADR amendment.
- **Description**: Document that `/foods`, `/foods/[slug]`, and
  `/feeding-setup` are compatibility redirects and that legacy modules are
  exercised only by `pnpm verify:legacy`.
- **Dependencies**: Task 2.2.
- **Acceptance Criteria**:
  - The compatibility behavior is discoverable.
  - The active verification command and legacy verification command are not
    conflated.
- **Validation**: Documentation review and signed-out route smoke checks.

## Sprint 3: Isolate retained legacy implementation

**Goal**: Prevent old safety, inventory, catalog, and planner implementation
from re-entering the active recipe product while keeping rollback history and
the explicit legacy test path intact.

**Demo/Validation**: Active source and routes have a clear dependency boundary;
legacy verification still runs independently; no historical migration is
deleted.

### Task 3.1: Produce an active/legacy dependency inventory

- **Location**: `src/app/`, `src/components/`, `src/modules/`, `tests/`, and
  package scripts.
- **Description**: Confirm which files are reachable from active routes and
  which are reachable only through legacy tests or historical migrations.
  Record ambiguous files before moving or deleting anything.
- **Dependencies**: Sprint 2.
- **Acceptance Criteria**:
  - Active routes do not import legacy catalog, eligibility, planner,
    reactions, derived-work, or storage modules.
  - Compatibility redirects are listed as intentional.
  - Any proposed deletion has no active or legacy-test dependency.
- **Validation**: Static import search, route build, and both active and legacy
  test configurations.

### Task 3.2: Add an isolation guard

- **Location**: `scripts/` and `package.json`, with a focused test if useful.
- **Description**: Add a lightweight repository check that fails when active
  recipe routes import forbidden legacy modules or reintroduce removed product
  vocabulary into the active navigation. Keep the check narrow and explicit;
  do not scan historical migrations as active code.
- **Dependencies**: Task 3.1.
- **Acceptance Criteria**:
  - The check passes on the current checkout.
  - A deliberately introduced forbidden import or active-nav label fails the
    check with a useful message.
  - The check does not block legacy tests or historical migrations.
- **Validation**: Positive and negative script tests, then active and legacy
  verification.

### Task 3.3: Remove or relocate only proven-dead legacy surface

- **Location**: Specific files identified by Task 3.1; likely old compatibility
  components or unused source modules, never historical migrations by default.
- **Description**: For each candidate, either relocate it under an explicit
  legacy boundary or delete it only after proving no active route, legacy test,
  migration helper, or operational script needs it. Keep compatibility redirects
  when they protect old bookmarks.
- **Dependencies**: Task 3.2.
- **Acceptance Criteria**:
  - No active user-visible route exposes the former safety/inventory/catalog
    workflows.
  - `pnpm verify:legacy` remains green unless a separately approved legacy
    removal changes its scope.
  - No unrelated refactor or migration rewrite is included.
- **Validation**: Full active gate, `pnpm verify:legacy`, route smoke tests, and
  `git diff --check`.

## Testing Strategy

- Prefer deterministic fixture-driven tests for import behavior.
- Keep parser, normalization, duplicate, image, and SSRF rules covered by
  focused unit tests.
- Use Supabase integration tests for household privacy, duplicate persistence,
  planning relationships, deletion cascades, and image ownership.
- Use the mobile Playwright suite for the user journey and visible recovery
  states.
- Run `pnpm verify:legacy` only for retained historical behavior; it is not an
  active product acceptance gate.

## Potential Risks & Gotchas

- A test fixture that bypasses URL validation could accidentally weaken the
  production import boundary. Keep fixture access test-only and separately
  assert production rejection of private destinations.
- Live recipe pages change markup or block automated requests. They may be
  useful for manual smoke testing, but must not be the sole automated proof.
- Image suggestions are intentionally opt-in. Tests must distinguish a visible
  suggestion from a saved image.
- Duplicate imports must preserve caregiver edits. Never implement refresh by
  silently overwriting an existing recipe.
- The old codebase contains many legacy migrations and tests. Cleanup should
  reduce active-surface confusion, not erase rollback or historical verification
  without an explicit decision.
- Documentation changes can accidentally revive the former reviewed-food
  product. Use the current `AGENTS.md` and `CONTEXT.md` language as the anchor.

## Rollback Plan

- Keep each sprint in a separate commit or small commit series.
- Revert the browser-test and fixture commit independently if the test harness
  proves unstable; retain product behavior and unit coverage.
- Revert documentation-only commits independently without touching runtime
  code.
- For legacy cleanup, restore only the affected relocated/deleted files and
  rerun both active and legacy gates. Do not revert or rewrite applied database
  migrations.

## Suggested Commit Sequence

1. `test: cover recipe import in mobile browser`
2. `docs: reconcile recipe platform contract`
3. `chore: enforce active and legacy boundaries`
4. `chore: remove proven-dead legacy surface` (only if Task 3.3 identifies a
   safe, meaningful target)
