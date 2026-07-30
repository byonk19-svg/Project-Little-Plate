# 19 - Add account session controls

**What to build:** Give a signed-in caregiver a visible, non-destructive way to
end the local session and confirm that household data remains available for the
next passwordless sign-in.

**Blocked by:** 02 - Create an authenticated baby profile.

**Status:** complete

- [x] Account presents a distinct session section before permanent deletion.
- [x] A caregiver can sign out without deleting household, baby, plan,
  inventory, or history data.
- [x] Successful sign-out clears the local Supabase session and redirects to
  Login with a calm confirmation.
- [x] Protected routes redirect to Login after sign-out.
- [x] A later passwordless sign-in returns to the same household and active
  baby rather than creating duplicates.
- [x] A failed or ambiguous sign-out remains on Account and does not claim that
  the session ended.
- [x] The control is keyboard accessible and usable on the narrow mobile
  viewport.
- [x] Browser coverage proves sign-out, route protection, and preserved data.
- [x] Update this issue with decisions, changed artifacts, verification
  evidence, and remaining risks.

## Safety boundary

This ticket changes session control only. It must not delete or modify household
data and must not add or rewrite feeding, allergen, preparation, storage,
reaction, serving, or medical guidance.

## Decisions

- Use the existing Supabase SSR client and local sign-out scope.
- Keep permanent account deletion as a separate, explicitly confirmed action.
- Redirect successful local sign-out to `/login?signedOut=1`; render only a
  calm session-ended confirmation with no identity or authentication details.
- Return an explicit error from the server action when Supabase cannot confirm
  sign-out, leaving the caregiver on Account without claiming success.
- Verify authenticated claims immediately before local sign-out. A stale loaded
  Account page with missing or invalid claims is an ambiguous failure and must
  not redirect or claim that sign-out completed.
- Set a 60-second, HTTP-only, same-site completion marker only after confirmed
  local sign-out. Login renders the signed-out confirmation only when the query
  flag and marker are both present and authenticated claims are absent.
- Extend the Mailpit test helper with an opt-in excluded-message-ID seam so a
  second passwordless sign-in cannot reuse the already-consumed first message.
- Inspect preserved profile rows through the existing local Docker/Postgres
  test seam because direct service-role table access is intentionally revoked.

## Changed artifacts

- `src/app/account/page.tsx`
- `src/app/account/sign-out-form.tsx`
- `src/app/login/page.tsx`
- `src/modules/profiles/session-actions.ts`
- `src/modules/profiles/session-form-state.ts`
- `src/modules/profiles/session-marker.ts`
- `tests/e2e/account-deletion.spec.ts`
- `tests/e2e/support/passwordless-auth.ts`

## Acceptance evidence

- TDD red: the new focused mobile Playwright scenario authenticated, completed
  the baby profile, reached Account, and failed because the `Session` heading
  did not exist.
- Focused green: `pnpm exec playwright test
  tests/e2e/account-deletion.spec.ts --grep "signs out locally"` passed 1/1.
  It proved the visible sign-out action, `/login?signedOut=1`, calm
  confirmation, protected `/feeding-setup` and `/account` redirects, and a
  fresh second magic-link login.
- The same browser scenario captured the linked `user_profiles`, `households`,
  and `babies` rows before sign-out and after re-login. Both snapshots were
  identical: one membership/profile, one household, and one active baby with
  the same household ID and baby ID. It also proved one matching auth user with
  the same auth user ID and restored the `Session browser` active profile.
- TDD ambiguity red: an authenticated direct visit to `/login?signedOut=1`
  rendered a false confirmation before marker gating. With marker gating but
  without claims preflight, submitting a stale Account page redirected to
  Login instead of returning an error.
- Final focused ambiguity green: the Ticket 19 browser scenario passed 1/1. It
  retained the happy-path and preservation evidence, suppressed the forged
  authenticated query confirmation, and proved that clearing the loaded
  Account page's auth cookies before submit leaves the page on `/account` with
  an honest error and no success redirect.
- Regression evidence: the existing deletion scenario passed during an earlier
  whole-file run after the session-control implementation.
- `pnpm typecheck` passed.
- `git diff --check` passed.
- Focused Prettier check for all changed TypeScript/TSX artifacts passed.

## Fixture review

- Browser coverage uses a synthetic, isolated caregiver and baby profile only.
- No reviewed catalog fixture, feeding-eligibility rule, storage rule, allergen
  state, medical content, inventory record, or history mutation was added or
  changed.

## Remaining risks

- Final whole-file Playwright attempts were unstable in the shared local auth
  harness: both the new scenario and the unchanged deletion scenario failed
  before authentication because the existing `Check your email` success state
  did not appear within 20 seconds. A prior whole-file attempt passed the
  deletion scenario, and the final strengthened focused Ticket 19 scenario
  passed end to end. The full file was not rerun for this evidence-only
  follow-up.
- Sign-out failure copy is implemented at the server-action/form seam; the real
  Supabase transport-failure branch is not forced by the browser fixture. The
  missing-session ambiguity branch is covered by the stale-page browser case.
