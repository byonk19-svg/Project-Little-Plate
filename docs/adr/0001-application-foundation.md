# ADR 0001: Application foundation

- Status: Accepted
- Date: 2026-07-27
- Scope: Ticket 01 repository walking skeleton

## Context

Project Little Plate needs one deployable, mobile-first application shell and one
repeatable verification path before product-domain behavior is added. The V1
specification already chooses Next.js App Router, Supabase/PostgreSQL, strict
TypeScript, a fast TypeScript unit runner, and Playwright. This decision records
the concrete versions and boundaries needed to make those choices reproducible.

## Decision

- Use Next.js 16.2.12 App Router with React 19 and strict TypeScript 5.9.
- Use pnpm 11.9.0, pinned through `packageManager`, with a committed lockfile.
- Use CSS owned by the application rather than a component or utility framework.
- Use Vitest for TypeScript and component behavior at public seams.
- Use Playwright Chromium at an iPhone-sized viewport for the mobile browser seam.
- Use the Supabase CLI with PostgreSQL 17, ordered migrations, and
  `supabase/seed.sql` as the local database rebuild path.
- Use `pnpm verify` as the shared local and CI quality gate.

The shell publishes no feeding or storage guidance. Safety-critical content
remains unavailable until later tickets add reviewed, source-backed records.

## Consequences

- A clean checkout needs Node.js, pnpm, Docker, and a one-time Playwright browser
  installation.
- Verification is slower because it proves a production build, database reset,
  and real mobile browser flow rather than checking only source files.
- The small navigation and styling surface can evolve without first removing a
  broad UI dependency.
- Dependency install scripts are denied by default; the workspace explicitly
  permits only `esbuild`, `sharp`, and `unrs-resolver`, which are required by the
  selected build and lint toolchains.

## Deferred decisions

Passwordless dogfood authentication remains the preferred product direction but
is not implemented or finalized by Ticket 01. Hosted deployment environments,
content approval roles, and qualified reviewer assignments also remain deferred
to the tickets and human review workstreams that need them.

## Reversal conditions

Revisit this decision if an accepted product requirement cannot be met by the
App Router, if a selected tool no longer supports the active Node.js line, or if
the verification time materially blocks delivery. Any replacement must preserve
strict typing, deterministic database rebuilds, mobile browser proof, and the
safety-content boundary.
