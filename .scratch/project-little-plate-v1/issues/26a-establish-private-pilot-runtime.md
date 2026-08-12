# 26A - Establish the private dogfood runtime

**What to build:** Prepare a production-like private deployment boundary for
the owner and explicitly authorized testers without adding food content,
changing safety semantics, or weakening catalog publication isolation.

**Blocked by:** none

**Status:** ready-for-human

- [x] Server-only allowlist configuration accepts normalized tester emails.
- [x] An absent allowlist preserves local development behavior.
- [x] An explicitly empty or malformed allowlist fails closed.
- [x] A production build with no allowlist fails closed rather than opening the
      private runtime accidentally.
- [x] Proxy protects application routes from signed-out and
      non-allowlisted users.
- [x] The auth callback rejects non-allowlisted users before account bootstrap.
- [x] The login page explains private-pilot access rejection without exposing
      the configured allowlist.
- [x] No catalog, seed, publication, RLS, or safety-content behavior changes.
- [ ] Configure the deployed application URL and Supabase Auth redirect
      allowlist in the selected hosting environment.
- [ ] Set `PRIVATE_PILOT_ALLOWED_EMAILS` as a server-only deployment secret.
- [ ] Record deployment, rollback, backup/restore, and operational-log evidence
      without committing secrets or private tester details.
- [ ] Verify deployed login, unauthorized rejection, authorized onboarding,
      empty Foods state, and account deletion on a real mobile browser.

## Implementation artifacts

- `src/config/private-pilot-access.ts`
- `src/proxy.ts`
- `src/app/auth/callback/route.ts`
- `src/app/login/page.tsx`
- `.env.example` and the private deployment section of `README.md`

This slice is complete in source terms; hosted evidence is tracked below.

## Validation evidence

- `pnpm test` passed: 18 files, 137 tests.
- `pnpm test:catalog-sources` passed: 6 tests.
- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm build` passed with the Next 16 `proxy.ts` convention.
- Targeted Prettier checks and `git diff --check` passed.
- The malformed-allowlist correction was reviewed independently on both
  standards and spec axes; both returned **READY**.
- Docker Desktop was restored and `pnpm verify:database` passed: all current
  migrations applied on a clean reset and the local stack restarted.
- `pnpm verify` passed end to end on the merged fixture-stabilization baseline:
  formatting, lint, typecheck, 137 unit tests, 6 catalog-source tests,
  production build, clean database reset, 12 integration files/91 tests, 19
  Playwright tests, and whitespace checks.
- The authenticated browser paths relevant to 26A passed within that full run,
  including passwordless sign-in, profile bootstrap, sign-out, deletion,
  feeding setup, and Foods.
- Hosted private-dogfood schema promotion completed against Supabase project
  `ioqukpdpnsqcrsqswjcl` using the repository-pinned CLI (`2.109.1`). The
  remote Postgres version is `17.6`, compatible with the committed Postgres 17
  configuration.
- The pre-promotion dry run contained exactly the 22 committed forward
  migrations; after promotion, `supabase migration list` shows every local
  migration recorded remotely and a second dry run reports the database is up
  to date.
- The organization is on the Supabase Free plan, so managed daily backups are
  not included. A manual schema/data logical dump was created outside the
  repository before promotion; no backup artifact or secret is committed.
- Post-promotion smoke checks found zero foods, preparations, import receipts,
  or public catalog items. Anonymous direct table reads and anonymous
  `bootstrap_account` calls were denied; the anonymous public catalog RPC
  returned an empty array.
- Supabase advisors were reviewed after promotion. Existing INFO/WARN notices
  (including intentionally callable SECURITY DEFINER RPCs, RLS-without-policy
  service tables, and unused/unindexed structures) were recorded for later
  review; no migration failure or ERROR-level finding blocked this staging
  promotion.
- Real-mobile evidence has not been captured yet.

## Hosted private-dogfood evidence

- Vercel project `project-little-plate` is deployed at
  `https://project-little-plate.vercel.app` from `main` commit
  `6ccb0d9e2212c7a1a476521cca9357cd03476662`.
- Production runtime variables are configured in Vercel; the private allowlist
  remains server-only and is not recorded in this repository.
- Supabase Auth Site URL and the exact hosted callback
  `https://project-little-plate.vercel.app/auth/callback` are configured.
- Hosted browser evidence: authorized passwordless sign-in, household/profile
  bootstrap, empty Foods, empty Today, empty Week, empty Kitchen, empty
  feeding setup, sign-out, and sign-back-in all passed. Today remained empty
  rather than inventing a meal, and Foods showed `Awaiting review`.
- Account deletion passed. Post-deletion database counts for the authorized
  account, households, profiles, and babies were all zero, with no orphaned
  household rows.
- Direct anonymous `/today` access redirected to the restricted login screen.
- Remaining verification blocker: the immediate deleted-user retry returned
  Supabase Auth HTTP 429 email throttling, including after a quiet cooldown.
  No account or household was recreated. Retry must be repeated after the
  provider throttle clears before 26A can be marked complete.
- A separate non-allowlisted callback email was not exercised in the hosted
  browser because the controlled non-allowlisted request returned the same
  Supabase Auth HTTP 429 throttle before a link could be issued. The
  hosted database still reports zero Auth users, households, profiles, and
  babies, so no bootstrap occurred. The deployed anonymous route gate and the
  pre-bootstrap rejection unit coverage remain the available evidence for the
  rejection boundary until the provider throttle clears.
