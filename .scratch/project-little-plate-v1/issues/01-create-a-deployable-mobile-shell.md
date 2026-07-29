# 01 - Create a deployable mobile shell

**What to build:** Establish a runnable, mobile-first Project Little Plate application that exposes the four primary destinations and has one trustworthy verification path from a clean checkout.

**Blocked by:** None - can start immediately.

**Status:** complete
**Completion:** implemented and verified

- [x] Initialize the repository and preserve the approved product specification, repository guidance, and implementation plan.
- [x] Scaffold the current stable Next.js App Router with strict TypeScript and the agreed package manager.
- [x] Render accessible Today, Week, Kitchen, and Foods destinations through a responsive application shell.
- [x] Ensure primary navigation works with keyboard input, identifies the current destination without color alone, and uses 44 by 44 CSS-pixel primary targets.
- [x] Establish lint, typecheck, unit-test, production-build, and mobile Playwright smoke-test commands.
- [x] Establish a local Supabase workflow whose committed migrations and seed inputs can rebuild the database deterministically.
- [x] Add a single complete verification command that runs all currently applicable gates.
- [x] Configure CI to run the same gates and retain useful browser artifacts when E2E fails.
- [x] Document the exact clean-checkout setup, local database reset, development, and verification commands.
- [x] Record any durable framework, package-manager, or testing choice in the repository decision log.
- [x] Update this issue with commands run, results, changed artifacts, and unresolved risks.

## Decisions

- Next.js 16.2.12 App Router, React 19, strict TypeScript 5.9, and pnpm 11.9.0 establish the application baseline.
- Vitest covers typed environment and navigation component behavior; Playwright Chromium covers the real mobile browser seam.
- Application-owned CSS keeps Ticket 01 independent of a broad component or utility framework.
- The committed Supabase migration is intentionally product-domain neutral. It proves the migration path without beginning Ticket 02 schema work or inventing safety semantics.
- Mealboard Baby uses the dedicated local Supabase port range 56320–56329 so it can run without stopping the existing Mealboard or RT Scheduler stacks.
- Optional local Supabase analytics is disabled because its Windows setup requires exposing the Docker daemon over unauthenticated TCP; Ticket 01 does not use analytics.
- The anonymous shell smoke test requires no seeded user. A deterministic authenticated test account is deferred to Ticket 02, where authentication and household records first exist.
- The shell shows explicit foundation and unavailable-safety-content states. It contains no feeding, allergen, preparation, serving, or storage guidance.

## Verification evidence

| Command or check | Result |
| --- | --- |
| `git init -b main` | Passed; repository initialized on unborn `main`. |
| `pnpm install --frozen-lockfile` | Passed with pnpm 11.9.0. |
| `pnpm format:check` | Passed; all selected authored files match Prettier. |
| `pnpm lint` | Passed. |
| `pnpm typecheck` | Passed with strict TypeScript. |
| `pnpm test` | Passed: 2 files, 5 tests. |
| `pnpm build` | Passed; `/`, `/today`, `/week`, `/kitchen`, and `/foods` generated successfully. |
| `pnpm test:e2e` | Passed: 3 mobile Chromium tests covering root redirect, all destinations, visible and semantic current state, 44 by 44 minimum navigation targets, no horizontal overflow, and keyboard navigation. |
| `pnpm verify:database` | Passed; local services started, migration `20260727000000` and `supabase/seed.sql` applied, and the database reset completed. |
| Repeated `pnpm supabase:reset` with schema comparison | Passed; repeated clean resets produced matching migration/schema fingerprint `7a40d2fdcbb88b121010f76455213e374ef1395a2a3f2e020d414f46a957f6ae`. |
| `pnpm verify` | Passed in 152.3 seconds, including formatting, lint, typecheck, 5 unit tests, production build, database reset, 3 mobile Chromium tests, and whitespace checks. |
| `git diff --check` | Passed against the intent-to-add working tree. |
| `git diff --cached --check` | Passed. |
| `node scripts/check-whitespace.mjs` | Passed; local staged and unstaged paths are both checked. |
| README relative-link check | Passed; every linked repository source exists. |
| Working-diff secret-shape scan | Passed; no private-key, secret-key, or JWT-shaped values found. |

The complete `pnpm verify` entry point passed locally and CI calls the same command unchanged.

## Changed artifacts

- Repository and dependency foundation: `.gitattributes`, `.gitignore`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, TypeScript, ESLint, Prettier, Vitest, Next.js, and Playwright configuration.
- Mobile shell: root redirect, shared application shell, responsive navigation, Today, Week, Kitchen, and Foods routes, typed public-environment reader, and application styling under `src/`.
- Tests: navigation and environment unit tests plus mobile Chromium smoke tests.
- Database workflow: generated Supabase configuration on a dedicated local port range, a product-neutral baseline migration, deterministic empty seed, and start/reset/stop commands.
- Operations and documentation: CI verification workflow, failure-artifact retention, README setup/run/reset/verify instructions, and ADR 0001.
- Preserved sources: repository guidance, V1 specification and local issues, and the implementation plan remain in the initial Git working tree.

## Remaining risks

- The earlier Docker image stall was resolved by updating and restarting Docker Desktop. Docker Engine 29.6.2 completed all subsequent startup, health, migration, seed, and reset operations.
- Default Supabase ports were already owned by `rt-scheduler-off-onedrive`, so this project now commits the isolated 5632x range. Contributors must use the URL printed by `pnpm supabase:start`, as documented in the README.
- Local analytics remains intentionally disabled. Enabling it on Windows would require a separate security decision about Docker daemon exposure.
- CI configuration is committed to the working tree but has not run on GitHub because Ticket 01 explicitly prohibits committing or pushing.
- The E2E seed-account criterion from the broader Sprint 1 plan is not applicable to this anonymous shell. Creating an auth user or household now would begin Ticket 02; the dedicated seeded account remains a Ticket 02 acceptance concern.

## Comments

- 2026-07-27: Ticket 01 implementation completed except for the Docker-blocked database reset proof. No commit, push, pull request, deployment, or Ticket 02 work was performed.
- 2026-07-27: After Docker Desktop was updated and restarted, the project moved to an unoccupied local port range, disabled unused Windows-incompatible analytics, passed repeated deterministic database resets, and passed the complete `pnpm verify` gate. The prior external blocker is resolved.
