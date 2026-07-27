# 02 - Create an authenticated baby profile

**What to build:** Let a caregiver sign in without a password, receive an isolated household, and create the minimum baby profile needed to enter the product safely.

**Blocked by:** 01 - Create a deployable mobile shell.

**Status:** ready-for-agent

- [x] A caregiver can complete passwordless authentication and reach profile setup.
- [x] First authentication creates exactly one household and user profile even when the callback or request is retried.
- [x] Profile setup accepts an optional nickname, birth date, editable IANA time zone, feeding style, and one to three meal slots.
- [x] The interface explains that preparation eligibility is not based on birthday alone.
- [x] A successful setup creates one active baby and routes the caregiver into the application.
- [x] Partial failure leaves no orphaned household, user profile, or baby state.
- [x] Anonymous users cannot read household or baby data.
- [x] Household A cannot read or mutate household B through normal queries or direct service calls.
- [x] Child profile data has no public read path.
- [x] Browser coverage proves login and profile creation on a narrow mobile viewport.
- [x] Supabase integration coverage proves bootstrap idempotency, RLS isolation, and failure atomicity.
- [x] Update this issue with verification evidence and remaining risks.

## Implementation record

### Decisions

- Supabase passwordless email uses the SSR PKCE flow and a configured,
  validated application origin for callback and post-auth redirects.
- `bootstrap_account()` serializes concurrent retries per authenticated user and
  creates the household and user profile in one transaction.
- `complete_baby_profile()` is the only baby-profile write path. It validates
  IANA time zone membership, optional nickname length, feeding style, and one to
  three distinct meal slots, then creates or updates the household's one active
  baby.
- Household-owned tables grant authenticated read access only, with row-level
  policies for the caller's household. Anonymous table/function access and
  authenticated direct writes are revoked.
- Birthday is stored as private profile context and is not used to infer
  preparation eligibility. No safety content or safety semantics were added.

### Verification evidence

- `pnpm verify` — passed on 2026-07-27. This included formatting, lint,
  typecheck, 6 unit/component tests, production build, a clean local Supabase
  reset, 4 Supabase integration tests, 4 mobile Chromium tests, and the
  repository whitespace gate.
- `git diff --check` — passed on 2026-07-27.
- `pnpm exec supabase db advisors --local --type security --level warn --fail-on error`
  — passed with no issues.
- `pnpm exec supabase db advisors --local --type performance --level warn --fail-on error`
  — passed with no issues.
- The mobile flow requests a real local passwordless email, follows the Mailpit
  link, retries the actual app callback URL, creates the profile at the iPhone
  viewport, and confirms the authenticated Today state without horizontal
  overflow.
- The integration suite attacks `households`, `user_profiles`, and `babies` as
  anonymous and cross-household callers, attempts direct mutation, retries
  bootstrap concurrently, retries profile completion, and verifies invalid
  setup rollback.

### Changed artifacts

- Identity schema, RLS policies, grants, and transactional RPCs under
  `supabase/migrations/`.
- Passwordless login, auth callback, profile setup, authenticated Today state,
  and Supabase server utilities under `src/`.
- Unit, Supabase integration, and mobile browser coverage under `src/` and
  `tests/`.
- Verification wiring, environment contract, README, and ADR 0002.

### Remaining risks

- The passwordless flow is verified against the committed local Supabase and
  Mailpit configuration. A hosted environment still needs its own approved
  application URL, redirect allowlist, and SMTP delivery configuration before
  dogfood deployment.
- Ticket 02 deliberately records no feeding skills or safety eligibility.
  Until the later reviewed-skill ticket ships, the UI only explains this
  boundary and publishes no preparation guidance.
