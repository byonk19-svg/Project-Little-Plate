# Plan: Personal recipe platform pivot

**Generated**: 2026-08-11
**Estimated Complexity**: High
**Status**: Ready for implementation after product-direction confirmation

## Overview

Reposition Project Little Plate from a safety-aware baby meal operations tool
into a private personal recipe and meal-planning app. The product will let one
caregiver save recipes from other websites, enter recipes manually, organize
them, assign them to a seven-day plan, see the next planned recipe in Today,
and keep lightweight preparation notes in Kitchen.

This is a product cutover, not an incremental feature. The existing account,
private-household, passwordless-authentication, mobile shell, Week lifecycle,
and account-deletion foundations are candidates for reuse. The reviewed
catalog, feeding eligibility, reactions, storage deadlines, inventory,
groceries, and automatic planner are legacy domains to retire from the
caregiver experience.

The implementation should use additive schema and route changes first, prove
the new recipe flow, then remove or isolate legacy paths after the new product
has browser coverage. Existing production content is intentionally empty, so
no legacy safety-content backfill is required.

## Product contract

### In scope

- Private passwordless caregiver account and household ownership.
- Invite-only pilot access.
- Manual recipe creation and editing.
- Recipe URL import with structured-data extraction, editable preview, and
  source attribution.
- Recipe search, simple tags, favorites, and source-type labeling.
- Optional recipe images from caregiver uploads, approved URLs, or confirmed
  import suggestions.
- Seven-day manual Week with one recipe per meal slot.
- Today as the next planned recipe view.
- Kitchen as preparation status, optional portion count, and personal notes.
- Account deletion and private-data cleanup.

### Explicitly out of scope

- Safety, allergen, medical, developmental, serving, or storage judgments.
- Reviewed-content publication and qualified review workflows.
- Reaction reporting or reaction resolution.
- Full pantry inventory, expiration/deadline logic, or grocery lists.
- Automatic week generation or recommendation scoring.
- Push notifications, SMS, reminder email, social features, ratings, public
  sharing, creator profiles, or community content.

## Current repository truth

- The root route currently redirects to `/today`; the app shell has Today,
  Week, Kitchen, and Foods destinations.
- Current implementation is safety-specific and will not satisfy the new
  contract without a substantial domain cutover.
- Verification evidence from the audit: 137 unit tests, 91 integration tests,
  19 mobile E2E tests, lint, typecheck, build, formatting, catalog-source
  checks, and `git diff --check` passed.
- The global Supabase CLI is stale (`2.75.0`), while the pinned repo CLI is
  `2.109.1`. Use `pnpm exec supabase` or package scripts during implementation.
- The working tree contains an existing user change in
  `.scratch/project-little-plate-v1/issues/26a-establish-private-pilot-runtime.md`.
  Preserve it and do not mix it into the pivot work.

## Prerequisites and decisions

- Preserve private passwordless authentication and account deletion.
- Treat all personal and imported recipes as private caregiver content.
- Require caregiver confirmation before an imported recipe becomes saved data.
- Store imported recipe ingredients and instructions in full as editable
  structured/text fields, with the source URL retained; never execute
  imported HTML or scripts.
- Prefer JSON-LD `Recipe` extraction, with a bounded fallback parser only when
  structured data is absent.
- Never fetch URLs from the browser without server-side validation. Reject
  non-HTTP(S), localhost, loopback, link-local, private, reserved, or unsafe
  destinations; validate every redirect; enforce response size, content-type,
  and timeout limits.
- Do not bypass login, paywalls, robots controls, or access restrictions.
- Do not copy external images automatically. A page image may be suggested for
  confirmation, but the caregiver chooses whether to store it.
- Support one optional cover image per recipe in the first pilot. Galleries and
  multiple-image recipe layouts remain out of scope until real use demonstrates
  the need.

## Sprint 0: Product and repository cutover

**Goal**: Make the new product contract authoritative before code changes
begin, while preserving the current working tree and legacy history.

**Demo/Validation**:

- Product docs describe Personal recipe, Recipe import, Recipe image, and
  Prepared note consistently.
- The ADR and plan agree on the new navigation and exclusions.
- A legacy-domain inventory identifies every route, module, migration, test,
  and issue that will be retired, isolated, or reused.

### Task 0.1: Reconcile product documentation

- **Location**: `AGENTS.md`, `README.md`, `.scratch/project-little-plate-v1/PRD.md`,
  `CONTEXT.md`, `docs/adr/0019-personal-recipe-platform-boundary.md`
- **Description**: Replace the old caregiver-facing product contract with the
  confirmed personal recipe platform contract. Mark the old reviewed-content
  and safety-specific issue set as legacy history rather than active launch
  scope.
- **Dependencies**: None
- **Acceptance Criteria**:
  - Today, Week, Recipes, and Kitchen are the canonical destinations.
  - Personal recipe content is explicitly not safety-reviewed guidance.
  - The old catalog/review/private-pilot gate cannot be mistaken for the new
    product launch gate.
- **Validation**: Documentation search for stale user-facing claims; markdown
  formatting and `git diff --check`.

### Task 0.2: Create a legacy-domain retirement inventory

- **Location**: `src/modules/catalog`, `src/modules/catalog-import`,
  `src/modules/eligibility`, `src/modules/reactions`, `src/modules/storage`,
  `src/modules/derived`, `src/modules/planner`, related `src/app` routes,
  `tests/`, and `supabase/migrations/`
- **Description**: Classify each existing safety-specific artifact as reuse,
  isolate, deprecate, or delete. Do not delete migrations or user data paths
  until the new routes and account-deletion behavior are proven.
- **Dependencies**: Task 0.1
- **Acceptance Criteria**:
  - No legacy route is removed without a replacement or an intentional redirect.
  - Account ownership/deletion behavior is preserved.
  - The retirement list names the tests that must be replaced rather than
    merely deleted.
- **Validation**: Review the inventory against route/module/migration listings.

## Sprint 1: Personal recipe domain and private persistence

**Goal**: Create a private, editable recipe model that supports manual entry,
source attribution, tags, favorites, and future image attachments.

**Demo/Validation**:

- An authenticated caregiver creates, reads, edits, favorites, searches, and
  deletes a personal recipe.
- A second household cannot read or mutate it.
- Account deletion removes recipe records and attachments.

### Task 1.1: Define the recipe data model

- **Location**: New Supabase migration; `src/modules/recipes/`; recipe types and
  transport parsers
- **Description**: Add household-owned recipe records with title, description,
  ingredients, instructions, prep/cook time, servings, notes, source URL,
  source title/domain, source type (`manual` or `imported`), favorite state,
  tags, timestamps, and import status. Keep imported fields editable.
- **Dependencies**: Sprint 0
- **Acceptance Criteria**:
  - Required fields and bounded lengths are enforced in the database and domain
    parser.
  - Recipe source attribution is retained when present.
  - Imported/unconfirmed records cannot enter Week.
- **Validation**: Unit parser tests, Supabase integration tests for constraints,
  ownership, and import-state transitions.

### Task 1.2: Add RLS and household ownership policies

- **Location**: New Supabase migration and recipe integration helpers
- **Description**: Enable RLS on every exposed recipe table. Use household
  ownership resolved through the existing authenticated profile boundary. Add
  select/insert/update/delete policies with matching `WITH CHECK` protections.
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Anonymous users cannot access recipes.
  - Authenticated users cannot read or mutate another household’s recipes.
  - Service-role access is not required for normal caregiver CRUD.
- **Validation**: Cross-household integration tests, Supabase database lint and
  advisors with the pinned CLI.

### Task 1.3: Implement manual recipe CRUD

- **Location**: `src/modules/recipes/actions.ts`, form state, queries, and new
  recipe UI route/components
- **Description**: Add server actions and read models for create, edit, favorite,
  tag, and delete operations. Keep mutations idempotent where the UI can retry.
- **Dependencies**: Tasks 1.1–1.2
- **Acceptance Criteria**:
  - Manual recipe creation works without a source URL.
  - Invalid or empty recipe fields return actionable form errors.
  - Delete is household-scoped and reflected immediately in Recipes and Week.
- **Validation**: Unit form-state tests, integration CRUD tests, mobile E2E.

## Sprint 2: URL recipe scraping and confirmation

**Goal**: Let a caregiver paste a recipe URL and receive an editable import
preview without allowing arbitrary server-side fetching or untrusted markup.

**Demo/Validation**:

- A local fixture page containing JSON-LD recipe metadata imports into a preview.
- The caregiver edits and confirms the result before it becomes a personal
  recipe.
- Invalid, private-network, redirected, oversized, slow, paywalled, or
  unparseable URLs fail with a clear manual-entry fallback.

### Task 2.1: Build URL validation and bounded fetch boundary

- **Location**: `src/modules/recipe-import/`, server route/action, tests
- **Description**: Implement one server-side import seam with HTTPS/HTTP scheme
  validation, DNS/IP checks, redirect revalidation, timeout, response-size,
  content-type, and user-agent controls. Reuse the existing catalog-source
  hardening patterns where applicable, without treating recipe pages as
  approved catalog sources.
- **Dependencies**: Sprint 1
- **Acceptance Criteria**:
  - Requests cannot target loopback, private, link-local, reserved, or metadata
    destinations.
  - Each redirect is independently validated.
  - The importer never accepts credentials, arbitrary request methods, or
    unbounded response bodies.
- **Validation**: Unit and integration tests for SSRF, redirect, timeout,
  content-type, body-size, and DNS-rebinding-sensitive cases.

### Task 2.2: Extract and normalize recipe metadata

- **Location**: `src/modules/recipe-import/parser.ts` and parser tests
- **Description**: Prefer JSON-LD `Recipe` data; normalize title, ingredients,
  instructions, prep/cook/total times, servings, source title, and canonical
  URL into the personal recipe draft shape. Add a narrowly scoped fallback for
  common metadata only if fixture evidence justifies it.
- **Dependencies**: Task 2.1
- **Acceptance Criteria**:
  - Multiple JSON-LD blocks and `@graph` payloads are handled deterministically.
  - Malformed metadata produces a typed import failure, not guessed fields.
  - HTML/script/style content is never rendered as executable markup.
- **Validation**: Fixture-driven unit tests for valid, malformed, duplicate,
  partial, and multi-recipe pages; deterministic output tests.

### Task 2.3: Add import preview and caregiver confirmation

- **Location**: Recipes route/components and `src/modules/recipe-import/`
- **Description**: Show extracted fields as editable form values, label the
  source, allow cancellation, and create a saved personal recipe only after
  confirmation.
- **Dependencies**: Tasks 2.1–2.2
- **Acceptance Criteria**:
  - Unconfirmed drafts are private and cannot appear in Week or Today.
  - The caregiver can correct title, ingredients, instructions, and attribution.
  - Failed import links directly to manual entry without losing the URL.
- **Validation**: Mobile E2E using local fixture servers; retry and cancellation
  coverage.

## Sprint 3: Recipes experience and navigation

**Goal**: Replace Foods with a useful Recipes surface.

**Demo/Validation**:

- Recipes is the primary content destination.
- A caregiver can find a manual or imported recipe, open its detail page, edit
  it, favorite it, tag it, and start planning it.

### Task 3.1: Add Recipes list/detail/create/edit screens

- **Location**: `src/app/recipes/`, shared recipe components, `globals.css`
- **Description**: Create mobile-first list, detail, manual-entry, import, and
  edit surfaces. Include search, simple tag filters, favorites, source-type
  labels, empty states, and explicit import failures.
- **Dependencies**: Sprints 1–2
- **Acceptance Criteria**:
  - Navigation labels and page metadata say Recipes, not Foods.
  - Recipe text is rendered as safe text/structured content, never raw HTML.
  - Empty, loading, failed-import, and deleted-recipe states are clear.
- **Validation**: Component tests, mobile E2E, keyboard and axe checks.

### Task 3.2: Change primary navigation and compatibility routes

- **Location**: `src/components/navigation/destinations.ts`, shell, route
  redirects, feedback event allowlist
- **Description**: Use Today, Week, Recipes, and Kitchen. Redirect `/foods` to
  `/recipes` during transition, then remove the compatibility route only after
  browser evidence confirms no stale links remain.
- **Dependencies**: Task 3.1
- **Acceptance Criteria**:
  - Current destination semantics and keyboard navigation remain intact.
  - No user-facing copy refers to reviewed foods, safety publication, or
    feeding eligibility.
- **Validation**: Navigation tests, route smoke tests, accessibility E2E.

## Sprint 4: Manual Week and Today cutover

**Goal**: Plan and surface personal recipes without reviewed-content or planner
  dependencies.

**Demo/Validation**:

- A caregiver assigns one saved recipe to a meal slot, views it in Week and
  Today, edits/copies/skips/completes it, and sees the state stay consistent.

### Task 4.1: Add recipe-backed Week slots

- **Location**: New migration; `src/modules/meals/`; Week queries/actions/forms
- **Description**: Add one personal `recipe_id` per meal slot, preserving dates,
  configured meal slots, locks, status, copy, swap, delete, skip, complete, and
  notes. Remove the one-to-three reviewed component requirement from the new
  caregiver path.
- **Dependencies**: Sprint 1
- **Acceptance Criteria**:
  - Only confirmed household-owned recipes can be assigned.
  - A slot supports one recipe and optional note.
  - Existing plan edits remain versioned and idempotent.
- **Validation**: Unit domain tests, integration concurrency/retry tests,
  mobile E2E for the full Week lifecycle.

### Task 4.2: Replace Today with next-planned-recipe read model

- **Location**: `src/app/today/`, `src/modules/meals/today-queries.ts`,
  presentation components
- **Description**: Remove recommendation, safety, inventory, reaction, and
  reviewed-content branches. Render the current/next planned recipe, source
  link, personal notes, and clear empty/recovery states.
- **Dependencies**: Task 4.1
- **Acceptance Criteria**:
  - Today never invents an unplanned recipe.
  - Completed/skipped slots do not appear as the next planned item.
  - Empty Week state links to Recipes and Week planning.
- **Validation**: Unit query tests, mobile E2E, accessibility and performance
  checks for the authenticated Today read.

### Task 4.3: Remove automatic planner entry points

- **Location**: `src/app/week/planner-generation-form.tsx`, planner actions/
  queries, Week page, planner tests
- **Description**: Remove automatic generation and regeneration from the user
  experience. Retire planner modules/tests after the recipe-backed Week path
  has equivalent coverage.
- **Dependencies**: Task 4.2
- **Acceptance Criteria**:
  - No Generate/Regenerate control remains.
  - No planner code can write or replace a caregiver’s Week.
  - Legacy planner tables are not exposed through new routes.
- **Validation**: Route search, negative browser assertions, integration tests
  proving manual plan integrity.

## Sprint 5: Lightweight Kitchen preparation notes

**Goal**: Replace storage/inventory management with a simple caregiver-owned
preparation log.

**Demo/Validation**:

- A planned recipe can be marked preparing, prepared, used, or archived, with
  optional portions and notes; no app-calculated deadline appears.

### Task 5.1: Add prepared-note persistence

- **Location**: New migration; `src/modules/prepared-notes/`; account deletion
  cascade
- **Description**: Add household-owned notes linked to a recipe and/or Week slot
  with explicit status, optional portion count, free-text personal note,
  timestamps, and actor ownership. Define a small reversible lifecycle.
- **Dependencies**: Sprint 1 and Task 4.1
- **Acceptance Criteria**:
  - Notes never contain generated expiration or safety fields.
  - Counts are non-negative and bounded.
  - Account deletion removes notes atomically with household data.
- **Validation**: Domain tests, RLS integration tests, deletion regression tests.

### Task 5.2: Rebuild Kitchen as preparation log

- **Location**: `src/app/kitchen/`, preparation-note forms/components,
  `globals.css`
- **Description**: Render planned preparation tasks and note history. Remove
  batch preview, deadline, freezer/thaw, expired, reconciliation, and grocery
  sections.
- **Dependencies**: Task 5.1
- **Acceptance Criteria**:
  - Kitchen language says Prepare/Notes, not inventory or reviewed storage.
  - A caregiver can update status and notes with clear retry/error states.
  - No stale legacy action can mutate the new preparation-note model.
- **Validation**: Component tests, integration lifecycle tests, mobile E2E.

## Sprint 6: Recipe images and attachments

**Goal**: Add useful recipe visuals with explicit caregiver control and private
storage.

**Demo/Validation**:

- A caregiver uploads an image, edits alt text/source/rights note, sees it on a
  private recipe detail page, and deletes it.
- A scraped page image is only shown as a confirmation suggestion.

### Task 6.1: Choose and document image representations

- **Location**: ADR or plan decision record; recipe domain types
- **Description**: Use a private uploaded asset reference plus optional external
  URL reference. Store alt text, source URL, rights note, MIME type, dimensions,
  and ownership. Do not copy external images without confirmation.
- **Dependencies**: Sprint 1
- **Acceptance Criteria**:
  - Image records distinguish uploaded, external, and import-suggested sources.
  - Missing alt text or rights note produces an explicit incomplete state, not
    a silent claim of permission.
- **Validation**: Domain parser tests and schema review.

### Task 6.2: Add private Supabase Storage bucket and policies

- **Location**: New Supabase migration; storage policies; recipe image module
- **Description**: Add a private bucket with household-scoped object paths,
  authenticated read/write/delete policies, bounded MIME/size rules, and
  signed URL presentation. Ensure uploads, replacement, and deletion have the
  required INSERT/SELECT/UPDATE/DELETE access without exposing service keys.
- **Dependencies**: Task 6.1
- **Acceptance Criteria**:
  - Cross-household image reads and mutations fail.
  - Anonymous users cannot access objects.
  - Account deletion removes image metadata and storage objects or records a
    deterministic cleanup path.
- **Validation**: Supabase RLS/storage integration tests, local bucket smoke,
  advisors, and deletion tests.

### Task 6.3: Add upload, URL, and import-suggestion UI

- **Location**: Recipe detail/edit/import components; image server actions
- **Description**: Support caregiver upload, approved external URL, and a
  confirmed image suggestion from the imported page. Validate file type, size,
  dimensions, and alt text; render broken external URLs as recoverable states.
- **Dependencies**: Tasks 2.2 and 6.2
- **Acceptance Criteria**:
  - No page image is stored or displayed automatically without confirmation.
  - Uploads show progress/error/retry states and remain private.
  - Images do not block recipe saving when omitted.
- **Validation**: Unit validation tests, mocked image-import tests, mobile E2E,
  accessibility checks for alt text and focus behavior.

## Sprint 7: Legacy safety-domain retirement

**Goal**: Remove misleading old flows after the new recipe path is proven.

**Demo/Validation**:

- A clean deployment exposes only the personal recipe product contract.
- Legacy catalog, eligibility, reaction, storage, grocery, and planner paths
  are unreachable or explicitly retired.

### Task 7.1: Remove legacy caregiver routes and copy

- **Location**: `src/app/feeding-setup`, old `src/app/foods`, reaction forms,
  storage forms, derived grocery forms, planner forms, shared copy
- **Description**: Remove or redirect obsolete routes and eliminate claims of
  reviewed guidance, eligibility, safety status, deadlines, expiration, or
  inventory from the caregiver UI.
- **Dependencies**: Sprints 3–6
- **Acceptance Criteria**:
  - No old navigation or link target remains.
  - The user-facing copy matches ADR 0019.
  - Account/sign-out/deletion behavior still works.
- **Validation**: Repository search, route smoke tests, mobile E2E, full text
  accessibility pass.

### Task 7.2: Retire or isolate legacy modules and migrations

- **Location**: `src/modules/catalog`, `eligibility`, `reactions`, `storage`,
  `derived`, `planner`; Supabase migrations; legacy tests
- **Description**: Keep historical migrations intact unless a separate,
  reviewed cleanup is approved. Remove active imports and public read seams;
  add a later cleanup migration only after confirming no data dependency.
- **Dependencies**: Task 7.1
- **Acceptance Criteria**:
  - New routes cannot call legacy safety commands.
  - No destructive database cleanup occurs in this pivot without an explicit
    data-migration decision.
  - Tests are replaced with recipe-domain coverage, not deleted without proof.
- **Validation**: Typecheck, integration route coverage, migration reset, and
  Supabase security review.

### Task 7.3: Update verification and release gates

- **Location**: `package.json`, README, CI/config, `.scratch` issue records,
  docs/release
- **Description**: Replace catalog/review/private-pilot release gates with the
  private recipe pilot gate: authenticated recipe CRUD, import, image handling,
  Week/Today, Kitchen notes, privacy, accessibility, performance, and deletion.
- **Dependencies**: Tasks 7.1–7.2
- **Acceptance Criteria**:
  - `pnpm verify` tests the new product rather than requiring an empty reviewed
    catalog or safety fixtures.
  - The active issue records the pivot and validation evidence.
  - No stale release gate claims qualified content is required for this product.
- **Validation**: Full verification and documentation audit.

## Sprint 8: Private pilot and evidence

**Goal**: Prove the new recipe product with real users before broadening scope.

**Demo/Validation**:

- Invite-only users can complete the end-to-end recipe workflow on mobile.
- Product learning is based on recipe saves, import corrections, planning
  friction, preparation-note use, and image usefulness—not safety claims.

### Task 8.1: Define pilot workflow and success measures

- **Location**: New or revised `docs/release/private-recipe-pilot-gate.md`,
  local issue tracker
- **Description**: Define a small real-use period, qualitative friction capture,
  import success/correction rates, recipe-save rate, Week completion, and
  image usage. Keep analytics privacy-safe and exclude recipe text, URLs if
  sensitive, child details, and free-form personal notes.
- **Dependencies**: Sprint 7
- **Acceptance Criteria**:
  - Pilot remains invite-only.
  - Metrics measure usefulness and friction, not inferred feeding outcomes.
  - Stop conditions include privacy, account isolation, import security, and
    core workflow defects.
- **Validation**: Review gate and privacy audit.

### Task 8.2: Run populated mobile dogfood

- **Location**: E2E fixtures, pilot issue record, deployment configuration
- **Description**: Exercise manual recipes, URL imports, edits, favorites,
  images, Week planning, Today, Kitchen notes, retries, deletion, and empty/
  failure recovery on a real mobile browser.
- **Dependencies**: Task 8.1
- **Acceptance Criteria**:
  - Core flow works without legacy catalog content.
  - Import failures recover into manual entry.
  - Image upload and deletion do not leak across households.
- **Validation**: Real mobile browser evidence, accessibility checks, and
  representative performance measurement.

## Testing strategy

- Unit: recipe parsing/normalization, tag/search filtering, import states,
  image validation, Week slot transitions, prepared-note lifecycle, and safe
  text rendering.
- Integration: RLS, household isolation, idempotent CRUD, import boundaries,
  redirect/private-network rejection, storage policies, account deletion, and
  route-to-database ownership.
- E2E: passwordless login, manual recipe entry, URL import preview/confirm,
  import failure fallback, recipe edit/favorite/tag, image upload/URL/confirm,
  Week assignment/editing, Today next planned recipe, Kitchen notes, sign-out,
  and account deletion.
- Verification: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm build`, pinned Supabase reset/integration tests, Playwright mobile E2E,
  and `git diff --check`.
- Security: SSRF regression suite, XSS/HTML sanitization tests, file upload
  MIME/size/dimension tests, RLS/storage advisor review, and cross-household
  browser assertions.

## Potential risks and gotchas

- **Product-contract conflict**: `AGENTS.md`, the existing PRD, and accepted
  ADRs still describe the safety-aware product. Documentation reconciliation is
  a prerequisite, not optional polish.
- **Data migration**: the owner confirmed that no real user or production data
  needs to be preserved. Use a clean additive cutover; no legacy backfill or
  export is required before retiring the old caregiver flows.
- **Scraper fragility**: recipe sites vary widely. JSON-LD should be the first
  path; fallback extraction must be explicitly partial and editable.
- **SSRF**: URL import and remote image suggestions are server-side fetchers.
  They require redirect, DNS, IP-range, timeout, body-size, and content-type
  protections.
- **Copyright and attribution**: preserve source URL/title; do not imply
  ownership of copied text/images or bypass access controls. Review how much
  imported text is retained before broad release.
- **Untrusted content**: imported instructions, tags, notes, and source titles
  must render as text or sanitized markup. Never execute imported HTML.
- **Private image cleanup**: database deletion and object deletion can fail
  independently. Use an explicit cleanup state/retry path and test account
  deletion under partial failure.
- **Legacy surface leakage**: old `/foods`, `/feeding-setup`, and planner links
  may remain in tests, redirects, analytics, and copied UI. Use repository-wide
  searches before closing the cutover.
- **Overbuilding images**: start with one cover image per recipe and optional
  alt/source/rights metadata. Galleries and automatic image scraping are later
  decisions.
- **Global CLI mismatch**: use the pinned `pnpm exec supabase` path; do not rely
  on the stale global CLI.

## Rollback plan

- Keep legacy migrations and tables intact during the first implementation
  sprints.
- Gate new Recipes/Week/Today/Kitchen routes behind the existing private pilot
  access boundary until the new E2E suite passes.
- If URL import is unsafe or unreliable, disable import and retain manual recipe
  entry without rolling back the private recipe schema.
- If image storage is not ready, ship recipe text and external source links
  without image records; recipe creation must remain functional.
- If the product pivot is rejected after dogfood, the old safety-aware routes
  remain recoverable because the legacy data and migrations were not deleted.

## Open decisions to resolve before implementation

None. Product direction, data preservation, imported-text scope, and first-pilot
image scope are confirmed. Implementation can begin with Sprint 0.
