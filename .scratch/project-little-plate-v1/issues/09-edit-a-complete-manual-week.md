# 09 - Edit a complete manual week

**What to build:** Let a caregiver maintain a realistic seven-day component plan manually, including locks, swaps, copying, deletion, completion, skipping, and one-step undo.

**Blocked by:** 05 - Plan one meal manually.

**Status:** complete

- [x] Week supports the configured one to three meal slots across seven local dates.
- [x] A caregiver can lock and unlock a meal or individual component.
- [x] A caregiver can swap one component, swap a whole meal, or choose a quick backup.
- [x] A caregiver can undo the most recent swap through a bounded compensating action.
- [x] A caregiver can add or delete a component, copy a meal, and mark a meal skipped or completed.
- [x] Every added or swapped preparation is revalidated against current approval, skills, and restrictions.
- [x] Failed edits leave the committed plan unchanged and explain the actionable cause.
- [x] Status, locks, and edits survive refresh and appear consistently across applicable views.
- [x] Prior and future planning windows can be viewed without turning the mobile interface into a spreadsheet.
- [x] A supportive variety summary uses descriptive language without grades, streaks, failure colors, or nutritional diagnosis.
- [x] Integration tests cover every edit command, undo scope, stale state, and cross-household access.
- [x] Browser coverage proves the full manual Week workflow on a narrow viewport.
- [x] Update this issue with verification evidence and any deferred edit behavior.

## Implementation decisions

- `CONTEXT.md` is absent from this repository. AGENTS.md, this issue, the PRD,
  implementation plan, and accepted ADRs supplied the canonical context.
- One plan version serializes the complete Week edit lifecycle. An edit locks
  the active baby and existing plan, requires the browser's expected version,
  and commits one version plus one append-only audit event or leaves the read
  model unchanged. A rejected first edit does not create an empty plan.
- Idempotency is bound to actor, plan, operation, and exact payload. Serving
  and Week edits use the same advisory-lock then active-baby-lock order; a
  shared-key serving/status race deterministically produces one valid outcome
  without deadlock.
- Meal and component locks and `planned`, `skipped`, and `completed` statuses
  are persisted. Component edits require a planned unlocked target. Skipped
  and completed meals are omitted from Today and cannot consume a portion;
  skipping a meal after any component was served is refused.
- Every add, component swap, whole-meal swap, quick backup, copy, and undo
  resolves current reviewed publication and feeding eligibility while holding
  the active-baby boundary. Copy refuses a source whose stored revision was
  superseded instead of silently attaching or rewriting historical guidance.
- Existing components are re-evaluated on every Week read. A newly restricted,
  skill-incompatible, retired, or superseded preparation is retained for
  recovery but marked replacement-required; preparation actions disappear
  while safe swap and delete controls remain.
- Undo is limited to the latest successful swap and appends a compensating
  event. It is rejected after any intervening edit, served state, or loss of
  current eligibility and never deletes the original event.
- The variety summary counts distinct reviewed foods only across currently
  planned meals. It remains descriptive and returns a neutral invitation when
  no planned meals remain.
- The Ticket 05 planning RPC delegates to the versioned edit command so older
  entry points cannot bypass locks, lifecycle status, or current eligibility.
- ADR 0009 records the durable plan-version, audit, undo, and cross-view
  lifecycle boundary.

## Reviewed fixture status

Production seed data remains unchanged and contains no food or safety
guidance. Ticket 09 extends only synthetic reviewed test fixtures:

- Real Supabase proof uses the Ticket 05 reviewed fixture for manual planning
  and the Ticket 06 reviewed refrigerator fixture for serving consistency.
- A synthetic version-2 revision proves a copied source cannot retain a
  superseded revision. It includes complete synthetic source, review, tag, and
  explicit unsupported-storage metadata and is retired during cleanup.
- Mobile Chromium uses four synthetic source-backed, approved, eligible
  preparations; one food is configured as a quick backup. The browser changes
  one planned food to temporary avoidance to prove replacement-required
  recovery without inventing guidance.
- Test revisions are retired after proof. Repeated clean database resets
  verify that no prior fixture state can hide a missing migration or boundary.

## Acceptance evidence

- The authenticated Week read model returns exactly seven local dates and the
  active baby's ordered one-to-three configured slots for current, previous,
  and next windows.
- Real Supabase coverage exercises add, delete, component and meal lock,
  component and whole-meal swap, quick backup, copy, skipped/completed/reopen,
  and bounded undo. Locks, statuses, quick-backup identity, and audit history
  survive a fresh read.
- Same-version concurrent edits serialize to one applied result and one
  `plan_stale` result. Exact retries return the original result; a changed
  payload with the same key is rejected. Invalid and no-plan edits leave the
  complete Week read model byte-for-byte unchanged.
- Restricted, reaction-blocked, skill-incompatible, unpublished, retired,
  unsupported, superseded, stale, invalid-slot, direct-write, anonymous, and
  cross-household paths fail without attaching a preparation or incrementing
  the plan version.
- A post-planning restriction produces `replacement_required` with its
  structured reason. A post-planning newer reviewed revision also requires
  replacement, and copy returns `source_preparation_changed` without creating
  a destination meal.
- Today omits skipped and completed meals. Serving a skipped meal returns
  `meal_not_planned` without an event. Concurrent serving and status edits
  share one lock order and yield either the valid serve or valid skip, never
  both.
- Mobile Chromium completes the full workflow on a narrow viewport, including
  refresh-persistent meal locking, prior/future navigation, calm variety copy,
  live replacement-required explanation, suppression of Prepare, retained
  swap/delete recovery, and no horizontal overflow.
- The strict Week transport parser rejects missing or wrongly typed safety
  reason fields instead of treating malformed payloads as eligible.

## Verification evidence

- Clean reset plus focused real Supabase proof:
  `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/manual-meal-planning.test.ts tests/integration/refrigerated-batch.test.ts`
  passed all 23 tests across both files.
- Focused mobile proof:
  `pnpm exec playwright test tests/e2e/manual-meal-planning.spec.ts --grep "edits a complete manual week" --reporter=list`
  passed the complete narrow-viewport workflow.
- Formatting, ESLint, strict typechecking, all 27 unit/component tests, and
  `git diff --check` passed after the review fixes.
- `pnpm exec supabase db lint --local --level warning --fail-on error` passed
  with no schema errors. Security and performance advisors returned no issues.
- `pnpm exec supabase migration list --local` confirmed all nine migrations,
  including `20260728162255`, match the rebuilt local database.
- Two-axis review against the issue/PRD/plan and repository standards found
  and resolved replacement-state visibility, superseded-revision copy,
  planned-only variety, lock ordering, no-plan rejection atomicity, strict
  safety-state parsing, and browser recovery coverage. Final re-review reached
  zero remaining code or acceptance findings.
- Final `pnpm verify` passed from the reviewed fixed point: formatting, ESLint,
  strict typecheck, 27 unit/component tests, production build, clean database
  reset, 43 real Supabase integration tests, 11 mobile Chromium tests, and the
  whitespace gate.

## Changed artifacts

- Database:
  `supabase/migrations/20260728162255_edit_complete_manual_week.sql`.
- Week transport and commands: `src/modules/meals/queries.ts`,
  `src/modules/meals/queries.test.ts`,
  `src/modules/meals/week-edit-actions.ts`,
  `src/modules/meals/week-edit-form-state.ts`, and
  `src/modules/meals/serving-actions.ts`.
- Caregiver surface: `src/app/week/page.tsx`,
  `src/app/week/week-edit-form.tsx`, and `src/app/globals.css`.
- Automated proof: `tests/integration/manual-meal-planning.test.ts`,
  `tests/integration/refrigerated-batch.test.ts`, and
  `tests/e2e/manual-meal-planning.spec.ts`.
- Documentation: README, ADR 0009, and this issue.

## Deferred behavior and remaining risks

- Production safety content remains externally blocked on qualified review and
  is not supplied by this implementation.
- Automatic week generation, collaborative merge UI, multi-step undo/redo,
  nutrition scoring, and automatic variety targets remain outside Ticket 09.
- Undo intentionally covers only the latest swap and becomes unavailable after
  an intervening edit. Reopening skipped/completed meals is supported; undoing
  a serve or rewriting an audit event is not.
- Copy targets one empty configured slot and does not overwrite an existing
  meal. Bulk copy, moving meals, and cross-baby planning remain deferred.
- Freezer, thaw, saliva-exposure, medical, allergen-introduction, and storage
  transitions remain unsupported unless a later active issue and reviewed
  structured policy explicitly define them.
