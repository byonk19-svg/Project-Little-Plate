# Project Little Plate

Project Little Plate is a mobile-first baby meal operations tool. Its product
promise is to help a caregiver know what to feed next, using what is already
available, before it expires.

This repository contains the first twelve vertical slices. A caregiver can request
a passwordless email link, bootstrap one isolated household, create one active
baby profile, and record observed abilities, food restrictions, exposure state,
planning preferences, and quick backups. Foods can list and display only active,
approved, source-backed preparations and explain whether the current profile
satisfies their reviewed eligibility requirements. An eligible reviewed
preparation can be placed into one of tomorrow's configured meal slots. From
Week, the caregiver can review an approved refrigerator rule and exact deadline,
then create two prepared portions in Kitchen. Batch events and deadlines retain
their reviewed rule provenance and are not recalculated on reads. Today shows
the current or next planned meal, distinguishes a ready portion from preparation
still required, and serves one planned portion through an atomic, idempotent
event. Today, Week, and Kitchen then reflect the same ledger-backed result.
Use-soon portions are ordered by their exact reviewed deadline using trusted
database time. Expired portions move to a separate, non-serveable Kitchen
section, and a caregiver can discard remaining portions through an idempotent,
append-only event without erasing their history. Kitchen now exposes freeze,
thaw, untouched-return, finish, and downward correction actions only when the
current state and active reviewed transition records permit them. Freezer
quality-by guidance is labeled separately from discard-after safety deadlines,
and frozen or thawing portions cannot be served. Week now supports all seven
local dates and the profile's configured slots, with versioned atomic edits for
locks, component and meal swaps, quick backups, copying, lifecycle status, and
one bounded compensating undo. Every attached preparation is revalidated
against current reviewed content and feeding eligibility, and skipped or
completed meals cannot appear as the next meal or consume a prepared portion.
After serving, a caregiver can report a reaction only when active reviewed care
direction is available. The report stores optional preference separately,
creates an immediate audited food safety block, removes the food from actionable
Today and future planner inputs, and marks affected Week meals for replacement.
Private reaction descriptions stay in household reaction history. Clearing the
block is a separate explicit audited action; ordinary preference editing cannot
clear it. Kitchen derives consolidated preparation work and grocery needs from
the committed seven-day plan, current eligibility, and valid ledger-backed
inventory. Reminder dismissals and grocery checks remain caregiver-owned
overrides, while manual grocery items use a separate persistence path so plan
edits cannot erase them. A configured quick backup subtracts grocery need only
after the caregiver marks that food already available.

The deterministic planner domain now accepts a complete reviewed snapshot and
returns either one reproducible, storage-feasible week or a typed failure with
no partial plan. Hard eligibility and deadline gates run before deterministic
soft priorities; database generation and regeneration remain a separate next
slice.

The production seed intentionally contains no food, reaction guidance, or other
safety-content fixtures.
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
- [Atomic planned serving decision](docs/adr/0007-atomic-planned-serving-boundary.md)
- [Trusted expiration and discard decision](docs/adr/0008-trusted-expiration-and-discard-boundary.md)
- [Manual Week edit lifecycle decision](docs/adr/0009-manual-week-edit-lifecycle.md)
- [Kitchen lifecycle decision](docs/adr/0010-kitchen-lifecycle-boundary.md)
- [Reaction safety-block decision](docs/adr/0011-reaction-safety-block-boundary.md)
- [Derived work and grocery decision](docs/adr/0012-derived-work-and-grocery-boundary.md)
- [Deterministic planner decision](docs/adr/0013-deterministic-planner-boundary.md)

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
