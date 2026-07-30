# 20 - Edit the active baby profile

**What to build:** Let a signed-in caregiver correct the one active baby's
profile through the same transactional boundary used during onboarding.

**Blocked by:** 19 - Add account session controls.

**Status:** ready-for-agent

- [ ] Account links to an authenticated profile-editing flow.
- [ ] The form is prefilled with the active baby's nickname, birth date, IANA
  time zone, feeding style, and configured meal slots.
- [ ] A caregiver can update every originally collected profile field.
- [ ] Saving reuses the authenticated transactional profile command and never
  creates a second active baby.
- [ ] Invalid input leaves the existing profile unchanged and returns an
  actionable error.
- [ ] Birthday remains private and is not presented as proof of preparation
  eligibility.
- [ ] Updated nickname, time zone, and meal slots appear consistently in Today
  and Week after refresh.
- [ ] Editing does not clear feeding eligibility, restrictions, reaction
  blocks, plans, inventory, or append-only history.
- [ ] Real-Supabase and mobile-browser coverage prove update, retry, isolation,
  and rendering behavior.
- [ ] Update this issue with decisions, changed artifacts, verification
  evidence, and remaining risks.

## Safety boundary

Profile data is caregiver-entered context. This ticket must not infer feeding
ability from age or alter reviewed safety content. Existing eligibility and
reaction restrictions continue to override convenience.

## Decisions

- Reuse `complete_baby_profile`; do not grant direct table writes.
- Reuse the onboarding form in an explicit edit mode rather than duplicating
  validation and field semantics.

## Evidence

Pending implementation.
