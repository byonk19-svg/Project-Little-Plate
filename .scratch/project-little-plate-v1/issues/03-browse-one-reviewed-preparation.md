# 03 - Browse one reviewed preparation

**What to build:** Let a caregiver browse and inspect one approved food preparation while proving that draft, retired, unsupported, or incomplete safety content cannot masquerade as published guidance.

**Blocked by:** 01 - Create a deployable mobile shell.

**Status:** complete

- [x] Model foods, tags, preparations, sources, content revisions, and storage rules as structured records with explicit lifecycle state.
- [x] Approved revisions are append-only and retain source, reviewer role, approval, and next-review metadata.
- [x] Normal application users cannot create, edit, approve, or retire curated safety content.
- [x] A deterministic import accepts valid fixtures and rejects missing source, review, allergen, skill, or rule references.
- [x] Running the import repeatedly produces the same content state without duplicates.
- [x] Foods lists only active preparations backed by an approved revision.
- [x] Food detail shows preparation context, skill prerequisites, allergen metadata, storage support state, source, and review provenance supplied by the content layer.
- [x] Draft, in-review, retired, incomplete, and unpublished preparations remain unavailable through UI and direct application queries.
- [x] Missing reviewed storage guidance displays an unsupported state and never receives a guessed deadline.
- [x] Quality guidance is visibly distinct from a discard-after safety deadline.
- [x] Browser coverage proves browse and detail behavior.
- [x] Integration coverage proves role permissions and publication lifecycle behavior.
- [x] Update this issue with verification evidence and the review status of all included fixtures.

## Decisions

- Revision workflow uses `draft`, `in_review`, and `approved`; retirement is a
  separate append-only event so an approved historical record is never
  rewritten.
- Approved revisions, their tag and storage-rule children, and every referenced
  source, tag, food, and preparation are immutable once approved content points
  at them. A changed payload requires a new identifier/version.
- Tables and fixture import are service-role only. Anonymous and authenticated
  application clients can read only the fail-closed published list/detail
  functions.
- Publication requires an active preparation, approved unretired revision,
  source, skill tag, allergen tag, and explicit storage-support record.
- `unsupported` storage records contain no deadline, duration, or guidance.
  Discard-after and quality rules remain distinct database and UI concepts.
- The production seed remains empty. No agent-authored preparation or safety
  guidance is shipped.

The durable boundary and reversal conditions are recorded in
`docs/adr/0003-reviewed-content-publication-boundary.md`.

## Fixture review status

- `tests/integration/reviewed-content-foundation.test.ts`: synthetic,
  conspicuously test-only lifecycle/import fixture. It is not qualified,
  reviewed production content and covers approved, draft, in-review, retired,
  inactive, supported-storage, and unsupported-storage states.
- `tests/e2e/reviewed-foods.spec.ts`: synthetic, conspicuously test-only browser
  fixture. It is not qualified, reviewed production content and exists only to
  prove the publication seam and safe rendering behavior.
- `supabase/seed.sql`: contains zero food or safety-content fixtures. The
  production-ready reviewed fixture count is zero.

## Verification evidence

- `pnpm verify:database` — passed after applying the reviewed-content migration
  to a clean local reset.
- `pnpm test:integration` — passed: 14 tests, including 10 Ticket 03 lifecycle,
  role, idempotency, rejection, immutability, publication, and provenance tests.
- `pnpm exec playwright test tests/e2e/reviewed-foods.spec.ts` — passed: 2 mobile
  Chromium browse/detail and fail-safe tests.
- `pnpm exec supabase db lint --local` — passed with no schema errors.
- `pnpm verify` — passed after both review passes approved the fixed diff: 6
  unit/component tests, production build, clean database reset, 14 Supabase
  integration tests, 6 mobile Chromium tests, and whitespace validation.
- `git diff --check` — passed after the final verification run.
- Independent specification and standards/security re-reviews — approved with
  no remaining Ticket 03 findings.

## Changed artifacts

- `supabase/migrations/20260727183314_create_reviewed_content_foundation.sql`
- `src/modules/catalog/queries.ts`
- `src/app/foods/page.tsx`
- `src/app/foods/[slug]/page.tsx`
- `src/app/globals.css`
- `tests/integration/reviewed-content-foundation.test.ts`
- `tests/e2e/reviewed-foods.spec.ts`
- `docs/adr/0003-reviewed-content-publication-boundary.md`
- `README.md`

## Remaining risks

- A qualified reviewer has not supplied a production preparation fixture.
  Foods therefore correctly shows an awaiting-review state after a clean reset.
- Reviewer assignment and a reviewer-facing authoring workflow remain external
  workstreams. This ticket provides the least-privilege import/publication seam,
  not a reviewer console.
