# 12 - Derive preparation work and groceries

**What to build:** Turn the committed manual week into a consolidated Kitchen work plan and compact grocery list that stay synchronized without erasing caregiver-owned overrides.

**Blocked by:** 09 - Edit a complete manual week; 10 - Complete the Kitchen lifecycle.

**Status:** complete

## Decisions

- Preparation and grocery rows are live authenticated derivations from the
  committed seven-local-day plan. Only caregiver overrides and manual grocery
  items are persisted, so failed edits cannot partially synchronize a second
  plan.
- Valid inventory uses the append-only portion ledger and must match the exact
  reviewed content revision. Refrigerated/thawing/thawed portions count only
  when their effective discard clock remains valid through the conservative
  end of the meal's local date. Frozen portions require their governed transition
  provenance and remain bounded by Ticket 10's preserved original discard
  deadline; quality dates never replace or extend that deadline.
- Task quantities are integer portions and each task retains exact supporting
  meal-component traces. Grocery items merge by stable reviewed food identity
  and use the structured food category as their store section.
- Reminder dismissal is scoped to a deterministic task-instance fingerprint
  containing the uncovered meal components plus relevant inventory and a
  durable semantic restriction version. Already-have and checked state are independent,
  operation-specific food-level caregiver choices, preventing stale forms from
  overwriting the other choice.
  Manual items are a separate soft-delete lifecycle with payload-bound,
  append-only mutation events.
- Practical action grouping is deliberately preparation-level in this slice.
  No action labels are inferred from reviewed free-text methods. Finer
  cross-preparation grouping remains deferred until reviewed structured action
  metadata exists.
- A configured quick backup is not assumed to be on hand. It subtracts grocery
  need only when the caregiver has also marked that food already available.

## Fixture review

- Production seed data remains empty of food and safety guidance.
- Integration and browser coverage use only explicit synthetic reviewed
  preparations, storage profiles, sources, and review metadata. Quantities and
  grocery labels are test-only operational data, not safety guidance.

## Acceptance evidence

- Pure derivation tests cover deterministic ordering, exact revision matching,
  future-meal deadline validity, frozen inventory, duplicate food merging,
  quick-backup availability, and independent grocery state.
- Real local Supabase coverage exercises every upstream Week edit class,
  reviewed-revision incompatibility, future expiry, frozen inventory,
  task-instance dismissal, restriction and inventory recomputation, RLS,
  atomic failures, manual-item lifecycle, and payload-bound retries.
- Mobile Chromium coverage exercises Week-to-Kitchen task and grocery
  synchronization, overrides, manual items, dismissal, and starting the
  reviewed batch flow.

## Changed artifacts

- `supabase/migrations/20260728223000_derive_preparation_work_and_groceries.sql`
- `src/modules/derived/`
- `src/app/kitchen/page.tsx`
- `src/app/kitchen/derived-work-forms.tsx`
- `tests/integration/refrigerated-batch.test.ts`
- `tests/e2e/refrigerated-batch.spec.ts`
- `docs/adr/0012-derived-work-and-grocery-boundary.md`
- `README.md`

## Remaining risks

- Cross-preparation action grouping remains deliberately deferred because the
  reviewed catalog has no structured action taxonomy; deriving action labels
  from free-text preparation methods would cross the safety boundary.
- The conservative local-day boundary leaves a same-day portion unassigned
  unless it remains valid through that entire local date. This is intentionally
  safe until the product
  stores reviewed meal times rather than inventing them.

## Verification

- `pnpm verify` passed: formatting, lint, typecheck, 63 unit tests, production
  build, clean local database reset, 48 real-Supabase integration tests, 11
  mobile-Chromium browser tests, and whitespace validation.
- `pnpm supabase db lint --local` passed with no schema errors.
- `git diff --check` passed.
- The issue and safety/standards review axes both completed with zero findings
  after all findings were resolved.

- [x] Kitchen groups required work by practical action rather than repeating tasks meal by meal.
- [x] Each preparation need identifies the meals it supports.
- [x] Quantities use practical portion units and avoid false-precision grams.
- [x] Completing a preparation task can start batch creation with the preparation already selected.
- [x] Dismissing a reminder hides that task instance without deleting its underlying meal requirement.
- [x] Grocery need is derived from the committed plan after subtracting assigned valid inventory, available quick backups, and already-have state.
- [x] Duplicate foods merge and display in practical store sections.
- [x] A caregiver can add, edit, check, and delete manual grocery items.
- [x] Manual items remain through plan edits unless the caregiver removes them.
- [x] Plan-derived and manual grocery items remain visibly distinguishable.
- [x] Swaps, deletions, copies, completion, restriction changes, and inventory changes recompute applicable derived state deterministically.
- [x] Failed plan edits cannot leave Kitchen or grocery state synchronized to an uncommitted plan.
- [x] Domain/integration tests cover derivation and every upstream edit class.
- [x] Browser coverage proves Week-to-Kitchen and Week-to-grocery synchronization.
- [x] Update this issue with verification evidence and any deliberately deferred task grouping.
