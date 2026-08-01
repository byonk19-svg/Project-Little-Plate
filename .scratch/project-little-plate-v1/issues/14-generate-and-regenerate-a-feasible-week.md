# 14 - Generate and regenerate a feasible week

**What to build:** Let a caregiver request a deterministic week, understand important choices or failures, preserve locked decisions during regeneration, and commit only a complete feasible result.

**Blocked by:** 13 - Build the deterministic planning engine.

**Status:** complete

## Repository facts

- Root `CONTEXT.md` is absent in this checkout. The active issue, PRD, delivery
  plan, accepted ADRs, and completed Ticket 02-04/13 boundaries were used as
  canonical context.

- [x] A caregiver can generate a week from current approved profile, inventory, plan, and content state.
- [x] Generation displays a useful pending state without presenting partial recommendations as committed.
- [x] A feasible result contains the configured meal slots and one to three eligible components per planned meal.
- [x] Important inventory, familiarity, preparation, and variety choices have plain-language explanations.
- [x] An infeasible result names actionable non-sensitive reasons and does not modify the committed plan.
- [x] Regeneration preserves locked meals and locked components exactly.
- [x] Generation commits the new plan and its reproducibility metadata atomically.
- [x] Concurrent generation requests cannot interleave partial plan versions.
- [x] The resulting Week immediately produces synchronized Kitchen and grocery derivations.
- [x] Direct-service attempts cannot save planner output that bypasses current hard constraints or feasibility validation.
- [x] Integration tests cover feasible, infeasible, stale-input, retry, concurrency, and locked-regeneration cases.
- [x] Browser coverage proves generation, explanation, failure recovery, locks, and regeneration.
- [x] Update this issue with verification evidence and the golden input/output identifiers used.

## Decisions

- Generation uses an authenticated, fixed-time snapshot RPC, the pure Ticket 13
  engine on the server, and a separate atomic commit RPC that rebuilds and
  compares the snapshot token after locking the active baby.
- The commit boundary rejects stale versions/tokens, incomplete or ineligible
  output, changed locks, unsupported storage strategies, and mismatched
  reviewed revisions before replacing any unlocked component.
- Only active eligible content whose content review and reviewed refrigerator
  profile cover the planning window enters this slice. Frozen/new-freezer paths
  remain unsupported rather than inferred.
- Idempotency, the plan version, planner explanations, rule revision IDs,
  reproducibility hash, timestamp, and append-only generation event are
  persisted in the same transaction.
- Generation metadata is displayed only for the exact persisted plan/window;
  historical windows cannot inherit current-plan controls or explanations.

## Fixture review status

- Integration goldens are synthetic and test-only:
  `revision-ticket-14-1` through `revision-ticket-14-4` and
  `profile-ticket-14-1` through `profile-ticket-14-4`. Fixtures 3 and 4 prove
  midweek content-review and storage-profile expiry boundaries.
- Browser goldens are synthetic and test-only:
  `revision-e2e-ticket-14` and `profile-e2e-ticket-14`.
- Each fixture has explicit source, reviewer, approval, next-review, skill, and
  allergen metadata. The storage profiles use a synthetic fixed 240-hour value
  only to exercise the reviewed-data seam. No fixture is added to production
  seed content or presented as real guidance.

## Acceptance evidence

- Pure adapter and planner tests: 44 passed, including malformed snapshot and
  deterministic complete-output coverage.
- Real local Supabase Ticket 14 integration: 4 passed, covering feasible commit,
  idempotent retry, no-write infeasibility, stale input, tampered output,
  forged provenance/reason copy, changed-body retry, malformed/duplicate
  positions, unsupported frozen claims, concurrent requests, full-window review
  coverage, exact component/meal locked regeneration, exact version/window
  metadata binding, and immediate preparation/grocery derivations.
- Mobile Chromium: 1 passed, covering pending state, generation, explanations,
  component and whole-meal locks, regeneration, actionable failure, and
  preservation of the previously committed seven-meal plan.
- Two-axis review: specification and standards re-reviews both reported zero
  remaining actionable findings after provenance, version/window, review
  horizon, malformed input, position uniqueness, unsupported storage, complete
  lock, semantic explanation, and idempotency fixes.
- `pnpm verify`: pass in 911 seconds; formatting, lint, typecheck, 107 unit
  tests, production build, clean local Supabase reset/database verification, 52
  real-Supabase integration tests, mobile Chromium end-to-end tests, and
  whitespace validation completed successfully.
- `pnpm supabase db lint --local`: pass with no schema errors.
- `git diff --check`: pass.

## Changed artifacts

- Planner snapshot/adapter/actions/query/form modules and Week integration.
- Transactional planner-generation migration and append-only event history.
- Integration and mobile-browser generation coverage.
- ADR 0014 and README product-slice documentation.

## Remaining risks

- Production safety content remains intentionally empty; public behavior stays
  unavailable until qualified reviewed content is imported.
- Frozen and thaw-transition generation paths are intentionally unsupported in
  this ticket because the required reviewed transition projection is not part
  of the current generation snapshot.
