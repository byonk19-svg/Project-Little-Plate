# 13 - Build the deterministic planning engine

**What to build:** Produce a pure, reproducible weekly planning result that applies non-overridable safety constraints, practical soft goals, and a reviewed storage-feasibility pass before any plan can be saved.

**Blocked by:** 10 - Complete the Kitchen lifecycle; 11 - Propagate reaction blocks everywhere; 12 - Derive preparation work and groceries.

**Status:** complete

## Repository facts

- Root `CONTEXT.md` is absent in this checkout. The active issue, PRD, delivery
  plan, accepted ADRs, and completed Ticket 10-12 boundaries were used as the
  canonical context.

## Decisions

- Ticket 13 is a pure domain boundary. It accepts one explicit, serializable
  snapshot and never queries Supabase, reads ambient time, or persists a plan.
  Ticket 14 owns the transactional snapshot/persistence adapter and browser
  generation flow.
- Meal requests contain a conservative reviewed `consumeBy` boundary. Storage
  feasibility compares exact reviewed content revisions and strict deadlines;
  the engine does not derive meal times or storage durations.
- Existing refrigerator/thawed units are allocated earliest-deadline first.
  Existing frozen units require recorded freeze, thaw, and post-thaw rule
  revisions. New portions use only caller-supplied reviewed strategies that
  explicitly name the meals they support.
- Every selected allocation passes a polynomial whole-plan capacity-matching
  check, so a locally preferred inventory choice cannot strand a later meal or
  lock.
  Any ineligible or storage-infeasible lock fails the whole result without
  exposing a partial plan.
- Meal-level locks must cover every component position. Duplicate identities,
  malformed instants, missing rule revisions, and out-of-bound snapshots fail
  closed before planning. One preparation may appear only once per meal,
  matching the persistence uniqueness constraint.
- Soft goals are a deterministic lexicographic policy applied only to eligible,
  feasible candidates. The engine emits stable reason codes and fixed calm
  explanations, never scores, safety copy, or generated guidance.
- The reproducibility hash canonicalizes set-like snapshot inputs, so database
  row order cannot change the plan or its provenance identifier.

## Fixture rationale

- Synthetic fixed-clock fixtures cover normal/new-preparation, restricted,
  no-valid-inventory, expiring exact-revision inventory, later locked
  components, reviewed frozen/thaw work, and typed infeasibility.
- A bounded 32-case publication sweep plus individual restriction, reaction,
  skill, snapshot-restriction, and wrong-revision invariants prove a
  disqualified candidate is never selected even when its soft inputs are most
  favorable. All rule identifiers and deadlines are explicit synthetic test
  metadata, not production safety guidance.
- Adversarial fixtures cover the greedy-allocation counterexample, timestamp
  offsets and exact deadline boundaries, duplicate/conflicting snapshot rows,
  complete and incomplete meal-level locks, same-meal uniqueness, and a full
  set of required golden results. A maximal 21-meal/63-component,
  resource-short snapshot verifies the feasibility pass remains bounded.

## Unresolved scoring policy

- The current deterministic order follows the PRD: valid refrigerator
  inventory, useful frozen inventory, familiar pairing, exact-plate avoidance,
  preparation reuse, variety, available backups, and preparation preference.
  Beta evidence may justify changing this soft ordering later, but no numeric
  score may override hard eligibility or storage feasibility.
- Cross-meal nutrition optimization remains out of scope and is not inferred.

- [x] Planner input explicitly snapshots approved preparations, skills, restrictions, exposure state, valid inventory, quick backups, meal count, preferences, locks, rule revisions, time zone, and clock.
- [x] Planner output is reproducible from the same input and independent of database row order.
- [x] Restricted, reaction-blocked, skill-incompatible, unpublished, expired, and deadline-infeasible candidates are disqualified before scoring.
- [x] Numeric or weighted soft goals cannot reintroduce a disqualified candidate.
- [x] Soft goals prioritize expiring valid refrigerator inventory, useful frozen inventory, familiar pairing, preparation reuse, variety, quick backups, and caregiver preparation preference.
- [x] Exact plate repetition and new preparation work can be discouraged without creating guilt-oriented scores.
- [x] Plain-language explanations come from deterministic reason codes rather than numeric scores or generated safety copy.
- [x] The feasibility pass allocates existing valid batches first, calculates required new portions, and uses refrigerator/freezer transitions only where approved rules permit.
- [x] Reviewed thaw tasks are produced when required.
- [x] Any remaining impossible meal produces a typed actionable infeasibility result.
- [x] A failed result contains no partial plan eligible for persistence.
- [x] Golden fixtures cover normal, restricted, no-inventory, expiring-inventory, locked, and infeasible weeks.
- [x] Property-oriented tests prove hard-constraint invariants across varied candidate sets.
- [x] Update this issue with verification evidence, fixture rationale, and unresolved scoring policy.

## Acceptance evidence

- `src/modules/planner/engine.test.ts`: 40 focused tests pass, including six
  complete golden outputs, a 32-case publication sweep, individual hard-gate
  properties, strict instant/deadline fixtures, lock and identity validation,
  reviewed thaw work, the greedy-allocation counterexample, and a maximal
  21-meal/63-component short-resource case.
- Two-axis review: specification and standards re-reviews both reported zero
  remaining actionable findings after the capacity-matching, runtime
  validation, weekly geometry, snapshot-consistency, and golden-fixture fixes.
- `pnpm verify`: pass in 794.6 seconds; formatting, lint, typecheck, 103 unit
  tests, production build, local Supabase reset/database verification, real
  Supabase integration tests, mobile Chromium end-to-end tests, and whitespace
  validation completed successfully.
- `pnpm supabase db lint --local`: pass with no schema errors.
- `git diff --check`: pass.

## Changed artifacts

- `src/modules/planner/engine.ts`
- `src/modules/planner/engine.test.ts`
- `docs/adr/0013-deterministic-planner-boundary.md`
- `README.md`
- this issue

## Remaining risks

- The deterministic soft-priority order is intentionally a beta policy and may
  need evidence-based adjustment. Hard eligibility, reviewed storage
  feasibility, rule provenance, and no-partial-plan behavior are not adjustable
  by that policy.
- No production safety content, storage duration, preparation guidance,
  allergen guidance, feeding guidance, or medical guidance was added.
