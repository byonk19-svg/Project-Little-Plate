# 19 - Add account session controls

**What to build:** Give a signed-in caregiver a visible, non-destructive way to
end the local session and confirm that household data remains available for the
next passwordless sign-in.

**Blocked by:** 02 - Create an authenticated baby profile.

**Status:** ready-for-agent

- [ ] Account presents a distinct session section before permanent deletion.
- [ ] A caregiver can sign out without deleting household, baby, plan,
  inventory, or history data.
- [ ] Successful sign-out clears the local Supabase session and redirects to
  Login with a calm confirmation.
- [ ] Protected routes redirect to Login after sign-out.
- [ ] A later passwordless sign-in returns to the same household and active
  baby rather than creating duplicates.
- [ ] A failed or ambiguous sign-out remains on Account and does not claim that
  the session ended.
- [ ] The control is keyboard accessible and usable on the narrow mobile
  viewport.
- [ ] Browser coverage proves sign-out, route protection, and preserved data.
- [ ] Update this issue with decisions, changed artifacts, verification
  evidence, and remaining risks.

## Safety boundary

This ticket changes session control only. It must not delete or modify household
data and must not add or rewrite feeding, allergen, preparation, storage,
reaction, serving, or medical guidance.

## Decisions

- Use the existing Supabase SSR client and local sign-out scope.
- Keep permanent account deletion as a separate, explicitly confirmed action.

## Evidence

Pending implementation.
