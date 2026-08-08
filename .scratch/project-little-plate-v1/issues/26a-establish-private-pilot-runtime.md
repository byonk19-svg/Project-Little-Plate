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

This slice is complete in source and unit-test terms, but deployment evidence
requires a hosting/Supabase environment and authorized tester configuration.

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
- No deployed browser evidence exists yet.
- Hosted Supabase is linked, but its remote migration history contains only the
  baseline migration. No remote schema push or Vercel deployment was performed.
