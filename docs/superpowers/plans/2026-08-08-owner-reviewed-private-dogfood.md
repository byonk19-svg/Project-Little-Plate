# Owner-Reviewed Private Dogfood Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow explicitly owner-approved, source-backed catalog content to run in the private dogfood environment while preserving the stricter qualified-review gate for external release.

**Architecture:** Keep the existing candidate import and qualified publication path intact. Add an immutable owner-approval record and a separate controlled private-publication RPC; mark approved revisions with `review_standard = private_dogfood_owner` and `reviewer_role = product_owner`. The current publication read boundary will expose private-dogfood content only to authenticated callers, while anonymous/external reads continue to expose only qualified external publications.

**Tech Stack:** Supabase SQL migrations/RPCs, PostgreSQL RLS and append-only triggers, Vitest/Vitest integration tests, Markdown ADRs and local issue tracker.

---

### Task 1: Define the bounded issue and policy documents

**Files:**

- Create: `.scratch/project-little-plate-v1/issues/25a-enable-owner-reviewed-private-dogfood.md`
- Modify: `.scratch/project-little-plate-v1/issues/25-import-and-qualify-private-pilot-package.md`
- Modify: `docs/adr/0003-reviewed-content-publication-boundary.md`
- Modify: `docs/adr/0017-catalog-release-pipeline-boundary.md`
- Modify: `docs/adr/0018-catalog-review-schema-gates.md`
- Modify: `docs/release/closed-beta-gate.md`

- [ ] Record the private-owner standard, explicit approval boundary, source/provenance requirements, unsupported-state behavior, and external-beta non-equivalence in the new issue.
- [ ] Mark Ticket 25 as still responsible for the qualified external package while pointing private dogfood implementation to 25A.
- [ ] Update ADRs so “qualified review required” is explicitly an external-release dependency, never an owner override of an external decision.
- [ ] State in the closed-beta gate that `private_dogfood_owner` content is excluded from external-beta qualification.

### Task 2: Add failing owner-path integration coverage

**Files:**

- Create: `tests/integration/private-dogfood-publication.test.ts`
- Test fixtures: reuse `tests/integration/support/catalog-publication.ts` only for synthetic test records; do not add production content.

- [ ] Add a test that imports one draft candidate, records explicit owner approval, publishes it through the new private RPC, and verifies authenticated reads can see it while anonymous reads cannot.
- [ ] Add a test that the qualified publication RPC rejects the owner-reviewed revision and `get_catalog_review_eligibility` reports it as not externally eligible.
- [ ] Add a test that owner approval and private publication replay with identical arguments are idempotent, while mismatched proof arguments fail.
- [ ] Run `pnpm vitest run --config vitest.integration.config.ts tests/integration/private-dogfood-publication.test.ts` and confirm the new tests fail because the owner path does not yet exist.

### Task 3: Persist the explicit review standard and immutable owner approval

**Files:**

- Create: `supabase/migrations/20260808120000_owner_reviewed_private_dogfood.sql`
- Modify: `docs/catalog-review/candidate-package.schema.json`
- Modify: `docs/catalog-review/catalog-package.template.json`

- [ ] Add `content_revisions.review_standard` with values `qualified_external` and `private_dogfood_owner`, defaulting existing rows to `qualified_external`.
- [ ] Add an append-only `catalog_owner_approvals` table with revision, `review_standard`, fixed `reviewer_role = product_owner`, opaque approval reference, review/approval/next-review dates, and exact idempotency constraints.
- [ ] Enable RLS and revoke direct table DML; grant only the controlled publication writer role the minimum privileges needed by the approval/publication RPCs.
- [ ] Add a controlled `approve_private_dogfood_revision` RPC that requires an existing draft candidate, existing source and explicit catalog metadata, non-empty approval reference, non-overdue dates, and no existing publication; it records the immutable owner standard and completes the linked review case without creating qualified-review submissions. The separate private-publication RPC freezes `review_standard` and `reviewer_role` on the approved revision.
- [ ] Reject owner approval for a revision with missing source, storage rule, skill/allergen tags, visual declaration, or preparation-time metadata.
- [ ] Preserve exact replay and reject proof changes; never permit direct owner-approval table writes.

### Task 4: Add a separate controlled private publication boundary

**Files:**

- Modify: `supabase/migrations/20260808120000_owner_reviewed_private_dogfood.sql`

- [ ] Extend publication classification checks to store `private_dogfood_owner` while retaining `production_candidate` for qualified releases.
- [ ] Add `publish_private_dogfood_revision` as a `SECURITY DEFINER` RPC owned by `catalog_publication_writer`.
- [ ] Require the exact completed case, matching owner approval, active non-retired revision, source, explicit storage/visual metadata, valid dates, and replacement invariants.
- [ ] Insert immutable publication proof with empty qualified-submission/adjudication arrays, activate the preparation, and freeze the approved revision with `review_standard = private_dogfood_owner` and `reviewer_role = product_owner`.
- [ ] Keep `publish_catalog_review_case` qualified-only and reject revisions whose review standard is private owner review.
- [ ] Make `get_catalog_review_eligibility` return a deterministic external-ineligible reason for owner-reviewed revisions.

### Task 5: Gate parent-facing reads by review standard and caller authentication

**Files:**

- Modify: `supabase/migrations/20260808120000_owner_reviewed_private_dogfood.sql`
- Modify: `tests/integration/catalog-publication-gate.test.ts` only if shared assertions need the new standard field.

- [ ] Update `current_published_preparations()` so qualified external publications remain available through existing public reads, while `private_dogfood_owner` publications require a non-null authenticated caller.
- [ ] Ensure Foods, Today, Week, feeding eligibility, planner, and manual-meal planning all inherit the same boundary through `current_published_preparations()`.
- [ ] Return `review_standard` in the detail read model so the distinction is visible and auditable.
- [ ] Preserve latest-proof-only, retirement, expiry, source, storage, visual, tag, and fail-closed checks.

### Task 6: Verify, document, and stop before adding food content

**Files:**

- Modify: `.scratch/project-little-plate-v1/issues/25a-enable-owner-reviewed-private-dogfood.md`

- [ ] Run the focused integration test, full `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm verify:database`, `pnpm test:integration`, `pnpm test:e2e`, and `git diff --check` as locally available.
- [ ] Confirm no production seed, real food values, Vercel variables, hosted Supabase data, or Ticket 26A evidence changed.
- [ ] Record the exact validation results, changed files, and remaining risks in 25A.
- [ ] Stop after the policy path is green; do not import egg or any other real food in this implementation.
