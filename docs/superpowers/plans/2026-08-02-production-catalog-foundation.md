# Plan: Production catalog foundation

**Generated:** 2026-08-02
**Estimated complexity:** High

## Overview

Build the missing candidate/review persistence foundation on top of the
existing Supabase catalog model. Keep production empty, preserve the current
publication boundary, and make each review dimension and lifecycle transition
explicit before any real food content is selected.

## Sprint 1: Candidate and review state

**Goal:** A service-role operation can create and transition a candidate case
without making it public.

### Task 1.1: Add normalized review tables and constraints

- **Location:** `supabase/migrations/`
- **Dependencies:** Existing reviewed-content and catalog-release migrations
- **Acceptance criteria:** Stable IDs link to existing revisions; dimension
  enum, decision enum, lifecycle enum, evidence/reference requirements, and
  append-only adjudication constraints are enforced.
- **Validation:** Clean reset plus role/constraint integration tests.

### Task 1.2: Add transition and eligibility RPCs

- **Location:** `supabase/migrations/`
- **Dependencies:** Task 1.1
- **Acceptance criteria:** Legal lifecycle transitions are deterministic;
  incomplete, blocked, synthetic, or unprovenanced cases cannot be eligible.
- **Validation:** Transition matrix tests and rejection-reason assertions.

## Sprint 2: Import and publication compatibility

**Goal:** Existing fixture/import seams can carry review metadata without
leaking candidates or changing approved history.

### Task 2.1: Extend the service-role import boundary

- **Location:** Existing catalog import migration/tests and review schema
- **Dependencies:** Sprint 1
- **Acceptance criteria:** Candidate imports are idempotent, reject missing
  dimension/evidence data, and never classify fixtures as production.
- **Validation:** Repeated import, malformed package, conflict, and synthetic
  classification tests.

### Task 2.2: Gate public catalog queries

- **Location:** Existing publication RPCs and catalog integration tests
- **Dependencies:** Task 2.1
- **Acceptance criteria:** Only eligible approved revisions publish; empty
  production remains empty; draft, blocked, retired, and fixture rows remain
  unavailable.
- **Validation:** Supabase integration plus Foods browser empty-state test.

## Sprint 3: Operational handoff

**Goal:** The owner can understand and adjudicate review outcomes without
private reviewer data or undocumented transitions.

### Task 3.1: Document review operations and evidence retention

- **Location:** `docs/catalog-review/`, `docs/operations/catalog-release.md`,
  active issue
- **Dependencies:** Sprint 2
- **Acceptance criteria:** Conflict, re-review, block, unblock, retirement,
  and historical provenance rules are documented and aligned with the packet.
- **Validation:** Documentation/schema checks and owner walkthrough.

## Testing strategy

- Pure transition/release eligibility tests for every lifecycle edge.
- Supabase reset, RLS, service-role, idempotency, append-only, and public-read
  tests.
- Browser test for zero production records and no fixture fallback.
- Existing full `pnpm verify`, database lint/advisors, and `git diff --check`.

## Risks and mitigations

- Existing status constraints only support three states: add compatibility
  migration and test old fixtures before exposing new states.
- Reviewer evidence could accidentally become private data: store role and
  durable references only; prohibit contact details and medical notes.
- A broad import extension could become an authoring system: keep candidate
  and review exchange separate from production publication.

## Rollback

Do not backfill production. If the migration is rejected, revert the new
candidate/review migration and RPCs while leaving existing reviewed-content and
release-pipeline tables unchanged.
