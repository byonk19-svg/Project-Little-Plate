# Project Little Plate

Project Little Plate is a mobile-first baby meal operations tool. Its product
promise is to help a caregiver know what to feed next, using what is already
available, before it expires.

This repository contains the first six vertical slices. A caregiver can request
a passwordless email link, bootstrap one isolated household, create one active
baby profile, and record observed abilities, food restrictions, exposure state,
planning preferences, and quick backups. Foods can list and display only active,
approved, source-backed preparations and explain whether the current profile
satisfies their reviewed eligibility requirements. An eligible reviewed
preparation can be placed into one of tomorrow's configured meal slots. From
Week, the caregiver can review an approved refrigerator rule and exact deadline,
then create two prepared portions in Kitchen. Batch events and deadlines retain
their reviewed rule provenance and are not recalculated on reads.

The production seed intentionally contains no food or safety-content fixtures.
Ticket 03's automated fixtures are synthetic and test-only; production content
must remain unavailable until it receives the qualified review required by the
product specification.

## Product sources

- [Repository guidance](AGENTS.md)
- [V1 specification](.scratch/project-little-plate-v1/PRD.md)
- [V1 implementation plan](project-little-plate-v1-plan.md)
- [Application foundation decision](docs/adr/0001-application-foundation.md)
- [Household identity decision](docs/adr/0002-household-identity-boundary.md)
- [Reviewed content publication decision](docs/adr/0003-reviewed-content-publication-boundary.md)
- [Feeding eligibility decision](docs/adr/0004-feeding-eligibility-boundary.md)
- [Manual meal planning decision](docs/adr/0005-manual-meal-planning-boundary.md)
- [Refrigerated batch deadline decision](docs/adr/0006-refrigerated-batch-deadline-boundary.md)

## Prerequisites

- Node.js 24 (Node.js 20.9 or newer is required by Next.js 16)
- pnpm 11.9.0
- Docker Desktop or another Docker-compatible daemon
- Git

## Clean-checkout setup

From PowerShell:

```powershell
git clone <repository-url> mealboard-baby
Set-Location mealboard-baby
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
Copy-Item .env.example .env.local
```

After `pnpm supabase:start`, replace the example values in `.env.local` with the
local API URL and publishable key printed by the CLI. The local passwordless
email arrives in Mailpit at [http://127.0.0.1:56324](http://127.0.0.1:56324).

## Local development

Start or resume the committed local Supabase stack:

```powershell
pnpm supabase:start
```

Rebuild the local database from migrations and `supabase/seed.sql`:

```powershell
pnpm supabase:reset
```

Start the web application:

```powershell
pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Stop the database services
when they are no longer needed:

```powershell
pnpm supabase:stop
```

## Verification

Install the Playwright browser once, ensure Docker is running, then use the one
complete gate:

```powershell
pnpm exec playwright install chromium
pnpm verify
```

`pnpm verify` runs formatting checks, lint, strict typechecking, unit tests, the
production build, local Supabase startup and reset, Supabase integration tests,
mobile Playwright flows, and whitespace checks over both staged and unstaged
local changes or the CI commit range. Browser traces, screenshots, and videos
are retained only when a Playwright test fails.

To isolate a failure, the underlying commands are:

```powershell
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm verify:database
pnpm test:integration
pnpm test:e2e
git diff --check
```
