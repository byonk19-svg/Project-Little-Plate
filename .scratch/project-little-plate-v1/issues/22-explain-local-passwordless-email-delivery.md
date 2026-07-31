# 22 - Explain local passwordless email delivery

**What to build:** Tell local developers where Supabase captured the one-time
sign-in message without changing production authentication behavior.

**Blocked by:** 19 - Add account session controls.

**Status:** done

- [x] Local setup supports an optional `NEXT_PUBLIC_LOCAL_MAIL_URL`.
- [x] A configured value must be an absolute loopback HTTP(S) URL.
- [x] After a successful local sign-in request, Login provides an `Open local
  inbox` link and explains that the message was captured locally.
- [x] When the value is absent, production sign-in copy remains unchanged.
- [x] The app never guesses a Mailpit address or links to an arbitrary external
  host.
- [x] No email address, auth token, or one-time link is copied into application
  logs, analytics, or UI configuration.
- [x] `.env.example` and local setup documentation describe the optional value.
- [x] Unit and mobile-browser coverage prove configured, absent, and invalid
  cases.
- [x] Update this issue with decisions, changed artifacts, verification
  evidence, and remaining risks.

## Safety boundary

This ticket changes local developer guidance only. It does not change
authentication, production email delivery, or any feeding and safety content.

## Decisions

- Require explicit configuration and validate the destination as loopback.
- Keep the existing passwordless PKCE flow unchanged.
- Treat an absent or whitespace-only value as unconfigured so production copy
  and UI remain unchanged.
- Accept only absolute `http` or `https` URLs whose hostname is exactly
  `localhost`, `127.0.0.1`, or `[::1]`.
- Reject credentials, query strings, and fragments instead of sanitizing them.
  This gives configuration the least authority and prevents email, token, or
  redirect data from reaching the link destination.
- Pass the validated value from the Login server page to the client form. Show
  the normal accessible link only in the successful `Check your email` state,
  in a new tab with `rel="noreferrer"`.

## Evidence

- Changed artifacts:
  - `src/config/environment.ts` and `src/config/environment.test.ts`
  - `src/app/login/page.tsx` and `src/app/login/login-form.tsx`
  - `tests/e2e/local-email-delivery.spec.ts` and `playwright.config.ts`
  - `.env.example` and `README.md`
- Accepted unit fixtures:
  - `http://localhost:8025`
  - `https://localhost/inbox`
  - `http://127.0.0.1:56324`
  - `https://[::1]:8025`
- Rejected unit fixtures:
  - external hostname
  - embedded username/password
  - non-HTTP(S) protocol
  - query string
  - fragment
  - malformed value
- TDD red evidence:
  - focused environment tests initially failed because the optional value was
    neither returned nor rejected;
  - the focused mobile-browser test initially failed because the successful
    status contained only the unchanged production message.
- Verification:
  - `pnpm test src/config/environment.test.ts` - passed, 14 tests.
  - `pnpm exec playwright test tests/e2e/local-email-delivery.spec.ts
    --project=mobile-chromium` - passed, 1 test, with the ignored `.env.local`
    explicitly configured for the existing local development server.
  - `pnpm typecheck` - passed.
  - focused ESLint over the changed TypeScript files - passed.
  - focused `prettier --check` over the supported changed files - passed.
    `.env.example` has no inferred Prettier parser and was reviewed directly.
  - `git diff --check` - passed.

## Remaining risks

- Browser coverage exercises the explicitly configured local-development
  branch. The absent branch is covered by the environment unit assertion and
  remains a direct conditional omission in `LoginForm`; the existing
  production success copy is unchanged.
- Hosted environments must intentionally leave the optional variable unset.
  Invalid configured values fail environment validation rather than silently
  exposing a link.
