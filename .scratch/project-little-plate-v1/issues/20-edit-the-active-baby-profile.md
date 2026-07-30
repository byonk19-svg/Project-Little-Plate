# 20 - Edit the active baby profile

**What to build:** Let a signed-in caregiver correct the one active baby's
profile through the same transactional boundary used during onboarding.

**Blocked by:** 19 - Add account session controls.

**Status:** ready-for-human

- [x] Account links to an authenticated profile-editing flow.
- [x] The form is prefilled with the active baby's nickname, birth date, IANA
  time zone, feeding style, and configured meal slots.
- [x] A caregiver can update every originally collected profile field.
- [x] Saving reuses the authenticated transactional profile command and never
  creates a second active baby.
- [x] Invalid input leaves the existing profile unchanged and returns an
  actionable error.
- [x] Birthday remains private and is not presented as proof of preparation
  eligibility.
- [x] Updated nickname, time zone, and meal slots appear consistently in Today
  and Week after refresh.
- [x] Editing does not clear feeding eligibility, restrictions, reaction
  blocks, plans, inventory, or append-only history.
- [x] Real-Supabase and mobile-browser coverage prove update, retry, isolation,
  and rendering behavior.
- [x] Update this issue with decisions, changed artifacts, verification
  evidence, and remaining risks.

## Safety boundary

Profile data is caregiver-entered context. This ticket must not infer feeding
ability from age or alter reviewed safety content. Existing eligibility and
reaction restrictions continue to override convenience.

## Decisions

- Reuse `complete_baby_profile`; do not grant direct table writes.
- Reuse the onboarding form in an explicit edit mode rather than duplicating
  validation and field semantics.
- Treat any query mode other than the server-recognized `mode=edit` as create
  mode. Bind the server-selected mode into the server action and re-check the
  active-baby cardinality before calling the RPC, so a crafted form submission
  cannot use create mode to edit an existing baby or edit mode to create one.
- Keep onboarding defaults and its `/today` redirect unchanged. Edit mode
  supplies typed defaults for every collected field and redirects to
  `/account?profileUpdated=1`.
- Enforce expected create/edit mode inside `complete_baby_profile`, after its
  per-user advisory lock and active-baby `FOR UPDATE` read. Create mode remains
  idempotent only when every normalized profile field matches; a conflicting
  stale create fails without rewriting the baby. The optional database
  parameter preserves the existing five-argument auto/update behavior for
  established internal callers.

## Evidence

- Changed artifacts:
  - `src/app/account/page.tsx`
  - `src/app/profile-setup/page.tsx`
  - `src/app/profile-setup/profile-form.tsx`
  - `src/modules/profiles/actions.ts`
  - `supabase/migrations/20260730220000_enforce_profile_expected_mode.sql`
  - `tests/integration/authenticated-baby-profile.test.ts`
  - `tests/e2e/profile-editing.spec.ts`
- TDD RED: the new focused mobile scenario failed waiting for the absent
  `Edit baby profile` Account link.
- Real-Supabase integration:
  `pnpm exec vitest run --config vitest.integration.config.ts
  tests/integration/authenticated-baby-profile.test.ts --reporter=verbose
  --maxWorkers=1` passed 1 file and 6 tests. The existing transactional RPC
  returned the same baby ID on retry, kept exactly one active baby, and an
  invalid update left all prior profile values unchanged. Focused expected-mode
  cases additionally proved that an exact create retry returns the same ID, a
  conflicting stale create cannot rewrite the profile, and edit mode cannot
  create a missing baby.
- Mobile browser:
  `pnpm exec playwright test tests/e2e/profile-editing.spec.ts
  --project=mobile-chromium` passed 1 test. It proved current-value prefill,
  all-field save, calm Account confirmation, updated Today nickname, updated
  Week IANA time zone and meal-slot rendering, and invalid-update rollback.
- The browser test resolves the created auth user through an exact-email local
  SQL lookup. It no longer depends on the first page returned by the paginated
  Auth Admin user listing.
- The browser fixture queried the real database before and after editing. The
  household ID and active baby ID stayed identical; there remained exactly one
  active baby; reviewed-content, feeding-eligibility, restriction, reaction,
  plan, and batch counts did not change; and every pre-edit append-only product
  event ID remained present. A later Today visit correctly appended analytics
  history rather than rewriting it.
- `pnpm typecheck` passed.
- `pnpm supabase:reset` applied every migration including
  `20260730220000_enforce_profile_expected_mode.sql` and reseeded successfully.
- `pnpm exec supabase db lint --local --level warning` returned no schema
  errors.
- Focused Prettier completed without changes after formatting.
- `git diff --check` passed.

## Remaining risks

- No schema, reviewed content, eligibility semantics, storage rule, allergen,
  medical guidance, inventory lifecycle, plan lifecycle, or history mutation
  path changed. The focused fixture has no reaction report or refrigerated
  batch to display, so preservation is proven by the unchanged baby identity,
  unchanged boundary counts, and the RPC's existing single-row transactional
  update rather than by populating new safety-sensitive fixture records.
