# Project Little Plate

Project Little Plate is a mobile-first baby meal operations tool. Its product
promise is to help a caregiver know what to feed next, using what is already
available, before it expires.

This repository currently contains the Ticket 01 walking skeleton only. The
Today, Week, Kitchen, and Foods destinations are accessible placeholders; they
do not publish feeding, allergen, preparation, or storage guidance.

## Product sources

- [Repository guidance](AGENTS.md)
- [V1 specification](.scratch/project-little-plate-v1/PRD.md)
- [V1 implementation plan](project-little-plate-v1-plan.md)
- [Application foundation decision](docs/adr/0001-application-foundation.md)

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

The placeholder shell does not consume Supabase environment variables yet.
After `pnpm supabase:start`, replace the example values in `.env.local` with the
local API URL and publishable key printed by the CLI before a later ticket adds a
client.

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
production build, local Supabase startup and reset, mobile Playwright smoke
tests, and whitespace checks over both staged and unstaged local changes or the
CI commit range. Browser traces, screenshots, and videos are retained only when
a Playwright test fails.

To isolate a failure, the underlying commands are:

```powershell
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm verify:database
pnpm test:e2e
git diff --check
```
