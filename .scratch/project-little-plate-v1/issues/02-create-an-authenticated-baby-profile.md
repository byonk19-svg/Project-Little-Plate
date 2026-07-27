# 02 - Create an authenticated baby profile

**What to build:** Let a caregiver sign in without a password, receive an isolated household, and create the minimum baby profile needed to enter the product safely.

**Blocked by:** 01 - Create a deployable mobile shell.

**Status:** ready-for-agent

- [ ] A caregiver can complete passwordless authentication and reach profile setup.
- [ ] First authentication creates exactly one household and user profile even when the callback or request is retried.
- [ ] Profile setup accepts an optional nickname, birth date, editable IANA time zone, feeding style, and one to three meal slots.
- [ ] The interface explains that preparation eligibility is not based on birthday alone.
- [ ] A successful setup creates one active baby and routes the caregiver into the application.
- [ ] Partial failure leaves no orphaned household, user profile, or baby state.
- [ ] Anonymous users cannot read household or baby data.
- [ ] Household A cannot read or mutate household B through normal queries or direct service calls.
- [ ] Child profile data has no public read path.
- [ ] Browser coverage proves login and profile creation on a narrow mobile viewport.
- [ ] Supabase integration coverage proves bootstrap idempotency, RLS isolation, and failure atomicity.
- [ ] Update this issue with verification evidence and remaining risks.
