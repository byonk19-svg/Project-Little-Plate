# Plan: Project Little Plate V1

**Generated:** July 26, 2026
**Estimated complexity:** High
**Source of truth:** `C:\Users\byonk\Downloads\Project_Little_Plate_Product_Brief_and_V1_PRD.md`

## Overview

Build Project Little Plate as a greenfield, mobile-first Next.js application with a local-first Supabase migration workflow. Preserve the PRD's product boundaries and milestone order, but execute engineering as small end-to-end slices instead of building every database table, then every service, then every screen.

The first product proof is the Milestone 2 loop:

1. Create a baby profile.
2. Browse an approved food preparation.
3. Add it to tomorrow's meal.
4. Record two prepared portions.
5. Calculate and explain the reviewed storage deadline.
6. Show the batch in refrigerator inventory and Today.
7. Serve one portion atomically.
8. Prevent serving after expiration.

The automatic planner is intentionally delayed until this manual loop works during real use.

## Current repository truth

- `C:\dev\mealboard-baby` contains only `.omx`.
- It is not currently a Git repository.
- There is no application, package manifest, database schema, or test harness to preserve.
- The Markdown and DOCX PRDs have matching document structure. Use the Markdown file as the implementation source because its requirements and acceptance criteria are directly searchable and diffable.

## Attack principles

1. **Protect the safety boundary first.** Eligibility, restrictions, deadline calculation, and content approval are domain and database concerns, not UI conditionals.
2. **Ship walking vertical slices.** Each slice must cross UI, application service, database, RLS, and automated tests.
3. **Keep state transitions explicit.** Batch events are append-only. Corrections create events; they do not rewrite history.
4. **Make unsafe states unrepresentable where practical.** Database constraints and transactional functions enforce household ownership, nonnegative portions, approved content, restrictions, and expiration.
5. **Keep deterministic logic pure.** Storage deadline and planner modules accept explicit inputs and clocks, return typed results, and do not query the database.
6. **Derive before persisting.** Prep tasks and plan-derived grocery needs should be derived from the approved plan. Persist only user-owned state such as manual grocery items, checks, locks, and dismissals.
7. **Gate content publication.** Draft or overdue safety content cannot become newly selectable as approved content.
8. **Treat private dogfood as production data.** RLS, audit history, backups, privacy-safe analytics, and failure behavior must exist before using the app for real meals.

## Prerequisites and decisions

These are bounded implementation defaults, not reasons to delay the scaffold:

- Use the current stable Next.js App Router with strict TypeScript.
- Use Supabase CLI migrations and a repeatable `supabase/seed.sql`.
- Use one real authentication path for dogfood, preferably passwordless email.
- Model `households` from day one even though the V1 UI exposes one account and one active baby.
- Use Vitest or an equivalent fast TypeScript unit runner for pure domain tests.
- Use Playwright for the critical mobile workflow.
- Add database/RLS tests that execute as anonymous, authenticated household A, authenticated household B, and privileged content roles.
- Use a controllable clock in unit and integration tests.
- Defer final branding, billing, multiple babies in the UI, caregiver invitations, push notifications, recipes, and AI-generated planning.

## Parallel non-code safety workstream

Engineering can scaffold while this proceeds, but real safety content cannot be marked approved until the review gate is met.

### Safety Workstream A: First-ten-food worksheet

- Create one structured row per food and preparation for egg, chicken, black beans, plain yogurt, oatmeal, sweet potato, broccoli, avocado, banana, and pear.
- Capture skill prerequisites, method, shape/texture, allergen codes, restriction copy, source IDs, storage support, and unsupported states.
- Separate safety deadlines from quality guidance such as avocado oxidation.
- Assign a stable source and content revision identifier before import.

### Safety Workstream B: Review policy

- Obtain pediatric dietitian review for nutrition framing.
- Obtain pediatric feeding specialist review for preparation and texture guidance.
- Obtain clinician/allergy review for reaction and allergen copy.
- Define who may approve, retire, and urgently suspend content.
- Decide how overdue approved content behaves; the PRD intentionally leaves risk-based hiding to the product team.

### Safety Workstream C: Release evidence

- Preserve reviewer role, approval date, source date, next-review date, and revision.
- Produce an import validation report showing rejected records and reasons.
- Block publication when sources, review metadata, or required rules are missing.

## Sprint 0: Freeze the product contract

**Goal:** Put the PRD, decision log, and implementation boundaries under version control before application code grows around unstated assumptions.

**Demo/validation:**

- A new contributor can identify V1 scope, non-goals, safety gates, and the exact first vertical slice from repository docs.
- Every intentionally deferred product decision remains deferred.

### Task 0.1: Initialize repository and preserve product inputs

- **Location:** repository root, `docs/product/`
- **Description:** Initialize Git; add the Markdown PRD as a versioned product artifact; add a short README that points to the PRD and this plan.
- **Dependencies:** None.
- **Acceptance criteria:**
  - No generated secrets or local Supabase state are committed.
  - The original PRD content is preserved without silent editorial changes.
- **Validation:** `git status`, secret scan, and link check.

### Task 0.2: Add a decision log

- **Location:** `docs/decisions/`
- **Description:** Record decisions that affect implementation but are not product features: package manager, test runner, dogfood auth method, deployment environments, and content approval roles.
- **Dependencies:** Task 0.1.
- **Acceptance criteria:**
  - Each entry states context, decision, consequences, and reversal conditions.
  - Deferred PRD decisions are not accidentally finalized.
- **Validation:** Review each decision against PRD Sections 26 and 27.

## Sprint 1: Repository walking skeleton

**Goal:** Produce a deployable application shell with automated quality gates and a local database workflow, without pretending the product domain is implemented.

**Demo/validation:**

- The responsive four-destination shell runs locally.
- CI runs typecheck, lint, unit tests, build, and a minimal Playwright smoke test.
- A clean checkout can start and reset the local Supabase stack from documented commands.

### Task 1.1: Scaffold the web application

- **Location:** repository root, `src/app/`
- **Description:** Create a Next.js App Router TypeScript application with strict compiler settings, linting, formatting, and mobile viewport defaults.
- **Dependencies:** Sprint 0.
- **Acceptance criteria:**
  - No broad component library is added before interaction needs justify it.
  - Environment variables are typed and fail clearly when missing.
  - The initial page renders without client-side runtime errors.
- **Validation:** typecheck, lint, unit test, production build.

### Task 1.2: Add the mobile application shell

- **Location:** `src/app/`, `src/components/navigation/`
- **Description:** Add empty Today, Week, Prep & Store, and Foods routes with a mobile bottom navigation and accessible desktop adaptation.
- **Dependencies:** Task 1.1.
- **Acceptance criteria:**
  - Primary tap targets are at least 44 by 44 CSS pixels.
  - Current destination is conveyed without color alone.
  - Keyboard and screen-reader navigation work.
- **Validation:** component accessibility tests and Playwright mobile smoke test.

### Task 1.3: Establish test and CI harnesses

- **Location:** `.github/workflows/`, `tests/`, `playwright.config.*`
- **Description:** Add unit, integration, E2E, lint, typecheck, build, and `git diff --check` gates.
- **Dependencies:** Task 1.1.
- **Acceptance criteria:**
  - CI fails on any failed gate.
  - E2E uses deterministic seed state and a dedicated test account.
  - Test artifacts are retained on failure without committing them.
- **Validation:** Run the full workflow locally and in CI.

### Task 1.4: Establish local Supabase workflow

- **Location:** `supabase/config.toml`, `supabase/migrations/`, `supabase/seed.sql`
- **Description:** Initialize Supabase, document local start/reset commands, and establish migration-only schema changes.
- **Dependencies:** Task 1.1.
- **Acceptance criteria:**
  - `supabase db reset --local` recreates the database from committed files.
  - Secrets are referenced through environment variables.
  - Local generated state is ignored.
- **Validation:** Reset twice from a clean local database and compare results.

## Sprint 2: Identity and reviewed-content foundation

**Goal:** Establish household isolation and the minimum approved catalog needed by the vertical slice.

**Demo/validation:**

- A caregiver can authenticate and create one active baby profile.
- An authenticated household can read only its own profile.
- The app can display only approved, active food preparations.

### Task 2.1: Create identity and household migrations

- **Location:** `supabase/migrations/`
- **Description:** Add `households`, `user_profiles`, `babies`, `baby_skills`, `baby_food_restrictions`, and `quick_backups` with keys, checks, and timestamps.
- **Dependencies:** Task 1.4.
- **Acceptance criteria:**
  - One active baby is enforced by the application for V1 while the schema permits future expansion.
  - Time zones use valid IANA identifiers at the application boundary.
  - Birthdate and profile data are not publicly readable.
- **Validation:** migration reset, constraint tests, and cross-household RLS tests.

### Task 2.2: Implement authentication and bootstrap transaction

- **Location:** `src/modules/profiles/`, auth callbacks, database function migration
- **Description:** Add passwordless authentication and an idempotent household/profile bootstrap operation.
- **Dependencies:** Task 2.1.
- **Acceptance criteria:**
  - Repeated callback or retry does not create duplicate households.
  - A user cannot attach themselves to another household.
  - Failed bootstrap leaves no partial identity state.
- **Validation:** integration tests for first login, retry, and cross-household attack.

### Task 2.3: Create curated-content schema

- **Location:** `supabase/migrations/`, `src/modules/catalog/`, `src/modules/safety/`
- **Description:** Add foods, tags, preparations, sources, revisions, and storage rules with an explicit publication state.
- **Dependencies:** Task 1.4.
- **Acceptance criteria:**
  - Approved revisions are append-only.
  - Normal users cannot modify safety content.
  - Draft, retired, or unapproved preparations are not returned by the public catalog query.
  - Rules distinguish discard-after, quality-by, and informational deadlines.
- **Validation:** role-based RLS tests and content lifecycle transition tests.

### Task 2.4: Add validated seed import

- **Location:** `content/`, import script, `supabase/seed.sql`
- **Description:** Import the reviewed subset of the first ten foods from structured, version-controlled fixtures.
- **Dependencies:** Task 2.3 and Safety Workstream A.
- **Acceptance criteria:**
  - Import is deterministic and idempotent.
  - Invalid source, reviewer, restriction, allergen, or rule references fail the import.
  - Unreviewed rows remain draft and cannot appear as approved.
- **Validation:** golden import test, rejection fixtures, and two consecutive database resets.

## Sprint 3: First end-to-end product slice

**Goal:** Complete the PRD's Milestone 2 loop with one or two fully reviewed preparations before expanding to all ten foods.

**Demo/validation:**

- The exact ten-step Milestone 2 path passes on a narrow mobile viewport.
- Expired, restricted, cross-household, and depleted batches cannot be served through either UI or direct service calls.
- Deadline explanations identify the applied rule revision and source.

### Task 3.1: Add the pure deadline engine

- **Location:** `src/modules/storage/domain/`
- **Description:** Implement rule selection and elapsed-hour deadline calculation from explicit events, rule revisions, and an injected clock.
- **Dependencies:** Task 2.3.
- **Acceptance criteria:**
  - Range-based rules use the approved conservative endpoint.
  - UTC calculation is unaffected by daylight-saving changes.
  - Unsupported or ambiguous inputs return a typed unsupported result, never a guessed date.
  - Opening the app or editing a meal cannot extend a deadline.
- **Validation:** table/property tests for ranges, DST boundaries, exact expiry, rule precedence, unsupported cases, and frozen/thawed transitions.

### Task 3.2: Add the append-only batch ledger

- **Location:** database migrations, `src/modules/storage/`
- **Description:** Add batches, events, and deadline records. Treat events as authoritative and any cached remaining quantity as a transactionally maintained projection.
- **Dependencies:** Task 3.1.
- **Acceptance criteria:**
  - Quantity cannot become negative.
  - Correction events preserve prior history.
  - Every deadline records the governing rule revision and start event.
  - Batch and linked preparation must belong to valid visible content and the correct household/baby.
- **Validation:** database transition tests for prepare, refrigerate, freeze, thaw, serve, return untouched, discard, finish, and correct.

### Task 3.3: Create the atomic serve command

- **Location:** database function migration, `src/modules/meals/application/`
- **Description:** Implement a single transactional command that validates household, baby, restriction, content approval, batch status, deadline, and remaining portions before appending the serve event.
- **Dependencies:** Tasks 2.1, 2.3, and 3.2.
- **Acceptance criteria:**
  - Two concurrent attempts to serve the last portion yield exactly one success.
  - Retry with the same idempotency key does not double-decrement.
  - Expiration is checked against server/database time, not trusted client time.
  - Failure returns a safe reason code and leaves inventory unchanged.
- **Validation:** concurrent integration test, direct API bypass tests, expiration boundary test, and cross-household test.

### Task 3.4: Add manual meal placement

- **Location:** migrations, `src/modules/meals/`, Week route
- **Description:** Add the minimum plan, meal, and component model required to place an approved preparation into tomorrow's slot.
- **Dependencies:** Tasks 2.1 and 2.3.
- **Acceptance criteria:**
  - Restricted or skill-incompatible preparations cannot be attached.
  - Date interpretation uses the baby profile's time zone.
  - The operation is available without the automatic planner.
- **Validation:** service and integration tests for allowed, restricted, incompatible, and DST-adjacent dates.

### Task 3.5: Build food-to-batch UI

- **Location:** Foods, Week, and Prep & Store routes
- **Description:** Browse an approved food, inspect its preparation and source, add it to tomorrow, and create a two-portion batch.
- **Dependencies:** Tasks 2.4, 3.2, and 3.4.
- **Acceptance criteria:**
  - The rule and resulting deadline are shown before batch save.
  - Unsupported storage is explained and cannot be forced.
  - Batch creation is one-handed and targets completion within 30 seconds.
- **Validation:** component tests and Playwright partial flow.

### Task 3.6: Build Today and serving UI

- **Location:** Today route, `src/modules/meals/`, `src/modules/storage/`
- **Description:** Show the next planned meal, ready inventory, deadline explanation, and one-tap serve confirmation.
- **Dependencies:** Tasks 3.3 and 3.5.
- **Acceptance criteria:**
  - Earliest valid relevant deadline is prioritized.
  - Expired items appear separately and are never actionable as food.
  - Serving updates Today, inventory, and the planned meal consistently.
  - Saliva-exposed leftovers cannot be returned as available inventory.
- **Validation:** full Milestone 2 Playwright flow plus expired, depleted, concurrent, and saliva-exposure variants.

## Sprint 4: Manual week, prep, grocery, and exposure loop

**Goal:** Support one real week without automatic planning.

**Demo/validation:**

- A caregiver manually assembles and edits seven days.
- Prep quantities and grocery needs remain synchronized.
- Use-soon inventory and reaction blocks propagate everywhere.

### Task 4.1: Complete onboarding and profile editing

- Implement feeding skills, exclusions, exposure quick-select, prep preferences, meal count, and quick backups.
- Preserve the under-three-minute target with skippable exposure setup.
- Test unknown versus not-tried semantics and conservative `not sure` skill handling.

### Task 4.2: Complete manual Week editing

- Implement locks, component swaps, deletions, additions, copies, skip, complete, and single-action undo.
- Define undo as a compensating command with a bounded scope, not database history deletion.
- Test synchronization after every edit type.

### Task 4.3: Derive Prep & Store tasks

- Group work by action and trace each task back to supported meals.
- Completing a task may create a batch without re-entering the food.
- Dismissal hides the task instance but does not delete the plan requirement.

### Task 4.4: Derive grocery needs

- Compute plan-derived needs after subtracting valid assigned inventory, quick backups marked available, and `already have` checks.
- Keep manual grocery items in a separate persistence path so plan edits cannot erase them.
- Test merges, swaps, deletes, manual items, and already-have state.

### Task 4.5: Complete exposure and reaction flow

- Record preference separately from safety status.
- A reaction report immediately blocks automatic suggestions and future manual placement until explicitly resolved.
- Never send reaction text or allergy details to general analytics.
- Test existing planned meals when a food becomes newly blocked; surface them for required replacement rather than silently leaving them valid.

### Task 4.6: Add use-soon and inventory lifecycle UI

- Order refrigerated inventory by exact deadline.
- Add freeze, thaw, discard, finish, and correction actions only where an approved transition/rule permits them.
- Test expired-at-open, deadline-crossed-while-open, and stale-client retry behavior.

## Sprint 5: Deterministic planner

**Goal:** Generate a safe, explainable week only after manual planning and inventory behavior are proven.

**Demo/validation:**

- Fixed fixtures reproduce identical plans and explanations.
- The planner either returns a fully feasible plan or a typed actionable failure.
- Locked meals/components survive regeneration.

### Task 5.1: Define planner input and output contracts

- Snapshot eligible preparations, restrictions, exposure state, valid inventory, preferences, locks, rule revisions, time zone, and clock.
- Persist the input/rule version or reproducibility hash with generated output.
- Define typed infeasibility reasons before implementing scoring.

### Task 5.2: Implement hard-constraint filtering

- Block restrictions, reaction reports, incompatible skills, expired batches, post-deadline scheduling, unpublished content, and unsupported storage transitions.
- Make hard constraints non-overridable by numeric scores.
- Add property tests proving no arbitrary candidate set can reintroduce a disqualified item.

### Task 5.3: Implement deterministic scoring

- Prioritize expiring/ready inventory, familiar pairing, prep reuse, variety, quick backups, and preparation-time preference.
- Add stable tie-breaking independent of database row order.
- Keep explanations based on selected reason codes, not exposed numeric scores.

### Task 5.4: Implement storage feasibility pass

- Allocate existing batches first.
- Split newly prepared portions between refrigeration and freezing only when approved rules permit it.
- Create reviewed thaw tasks.
- Reject any meal that remains infeasible; never stretch a deadline.

### Task 5.5: Integrate generation and regeneration

- Generate into a transactionally consistent plan version.
- Preserve locked items.
- Avoid showing partial output after failure.
- Test normal, restricted, no-inventory, expiring-inventory, locked, and infeasible golden weeks.

## Sprint 6: Dogfood hardening

**Goal:** Use the product for at least two real weeks and remove workflow friction without expanding scope.

**Demo/validation:**

- Used for real meals on at least 10 days.
- No P0/P1 safety or lifecycle defects remain.
- No routine workflow requires manual database repair.

### Task 6.1: Add privacy-safe product events

- Use the PRD event list and non-sensitive failure reason codes.
- Exclude exact birthdates, notes, reaction descriptions, and allergy details.
- Verify analytics payloads in automated tests.

### Task 6.2: Run structured dogfood

- Capture whether Today answered the question, inventory was accurate, logging was skipped, warnings were missed, and meal suggestions were practical.
- Record friction as reproducible issues with severity and workflow evidence.
- Do not add features merely because they were mentioned once.

### Task 6.3: Harden lifecycle and recovery

- Resolve stale tabs, retries, offline/poor-network failures, duplicate submits, deadline crossing during interaction, correction errors, and incompatible historical plans.
- Ensure safe rollback for optimistic UI.
- Add regression coverage before closing each defect.

## Sprint 7: Closed beta readiness

**Goal:** Expand only after the core loop is safe, useful, and operable.

**Demo/validation:**

- Forty to sixty foods pass the catalog inclusion gate.
- Account/data deletion works.
- Required clinical/content, privacy, and legal approvals are recorded.
- A small external cohort can use the app without privileged intervention.

### Task 7.1: Scale reviewed catalog

- Expand through the same validated import and publication pipeline.
- Add source-link monitoring, overdue-review reporting, visual license records, and alt text.

### Task 7.2: Add deletion and operational controls

- Implement authenticated account/data deletion with clear retention behavior.
- Add emergency content retirement without rewriting historical rule usage.
- Document backup, restoration, incident response, and environment promotion.

### Task 7.3: Complete beta quality gate

- Run WCAG 2.2 AA audit, mobile performance checks, RLS suite, full E2E suite, content QA, privacy review, and clinician approvals.
- Verify zero known cases of expired, restricted, unpublished, or skill-incompatible recommendations.

## Test strategy

### Every commit

- Typecheck.
- Lint.
- Relevant unit/integration tests.
- Production build when application code changes.
- `git diff --check`.

### Every migration

- Reset the local database from committed migrations and seed.
- Test forward behavior and destructive-change implications.
- Run household isolation and role tests.
- Verify generated types are current.

### Every safety or storage change

- Test exact deadline boundaries with an injected clock.
- Test UTC/local display across daylight-saving transitions.
- Test unsupported and ambiguous states.
- Prove content revision and source attribution remain visible.

### Every lifecycle command

- Test success, duplicate retry, unauthorized caller, invalid prior state, concurrent request, stale client, and failure atomicity.

### Release candidate

- Full mobile Playwright suite.
- Keyboard and screen-reader pass.
- RLS and direct-service bypass suite.
- Content publication and source-link QA.
- Privacy-safe analytics inspection.
- Backup/restore rehearsal.

## Commit sequence

Use one intentional commit for each atomic task. A practical opening sequence is:

1. `chore: initialize little plate repository`
2. `docs: add product brief and implementation decisions`
3. `chore: scaffold next app and quality gates`
4. `feat: add accessible application shell`
5. `chore: add local supabase workflow`
6. `feat: add household and baby profile foundation`
7. `test: enforce household row level security`
8. `feat: add reviewed content lifecycle`
9. `feat: import validated vertical-slice content`
10. `feat: calculate source-backed storage deadlines`
11. `feat: add append-only batch inventory`
12. `feat: serve a batch portion atomically`
13. `feat: add food to a manual meal`
14. `feat: complete today serving vertical slice`

Do not combine product docs, infrastructure, schema, domain logic, and UI into one "initial app" commit.

## Potential risks and mitigations

### Safety review becomes the critical path

Use draft fixtures to develop the pipeline, but clearly label them and prevent their publication. Complete one or two fully reviewed preparations before broadening the catalog.

### Cached inventory drifts from event history

Make the event ledger authoritative. Update cached remaining quantity only inside the same database transaction and add reconciliation checks.

### Client checks are bypassed

Enforce ownership, restriction, approval, expiration, and quantity rules in transactional database/service commands as well as UI affordances.

### Exact deadline changes while a screen is open

Revalidate at command time using trusted server/database time. Return a specific expired/stale reason and refresh the view.

### Plan edits corrupt derived lists

Keep a clean distinction between derived needs and user-owned overrides. Recompute deterministically after the committed plan version changes.

### Planner work starts too early

Do not implement scoring until the manual week can survive real use. Planner inputs should be learned from stable domain behavior, not guessed ahead of it.

### Horizontal tickets hide integration failures

Treat LP-01 through LP-05 as planning labels, not delivery boundaries. Demo and test complete user behavior at the end of every sprint.

## Rollback plan

- Keep schema changes in small forward migrations; do not rewrite applied migrations.
- Use feature flags only for incomplete externally visible workflows, not to bypass safety checks.
- Retire bad content revisions and publish corrected revisions; preserve historical rule references.
- Reverse user actions through compensating events where audit history matters.
- If a release introduces unsafe recommendation behavior, disable the affected content or recommendation path and fall back to manual eligible-food selection.

## Immediate next move

Begin Sprint 0 and Sprint 1 with LP-01. In parallel, start the first-ten-food safety worksheet and reviewer process. The first implementation target after the scaffold is not "all onboarding" or "the planner"; it is one reviewed preparation completing the entire prepare-store-serve-expire loop.
