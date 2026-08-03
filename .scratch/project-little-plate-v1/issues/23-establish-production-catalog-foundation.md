# 23 - Establish the production catalog foundation

**What to build:** Establish the technical structure for real candidate catalog
records and qualified review without selecting launch foods or creating any
safety-sensitive values.

**Blocked by:** 17 - Expand through the reviewed catalog pipeline.

**Status:** proposed

## Repository findings

- Production content is intentionally empty: `supabase/seed.sql` contains no
  catalog rows.
- The existing persistence model is Supabase relational storage in
  `supabase/migrations/20260727183314_create_reviewed_content_foundation.sql`
  (`sources`, `tags`, `foods`, `preparations`, `content_revisions`, revision
  tags, storage rules, and retirements).
- The release boundary is extended by
  `supabase/migrations/20260730120000_add_catalog_release_pipeline.sql` with
  immutable visual records, visual requirements/associations, preparation-time
  metadata, and a service-role release report.
- `import_catalog_fixture` is a service-role fixture/import seam, not a
  reviewer workflow. It currently supports `draft`, `in_review`, and
  `approved`; it does not represent `changes_requested` or `blocked`.
- Public reads are fail-safe through `list_published_catalog_items` and
  `get_published_preparation`, consumed by `src/modules/catalog/queries.ts` and
  `src/app/foods/page.tsx`. Empty production already renders “Awaiting review”;
  it must never fall back to test fixtures.
- The corrected review packet is the repository-side intake contract:
  `docs/catalog-review/catalog-review.schema.json`,
  `docs/catalog-review/catalog-review-form.template.md`, and
  `docs/catalog-review/current-catalog-inventory.md`.
- ADR 0003 and ADR 0017 require approved revisions and children to remain
  append-only, keep the seed empty, preserve source/reviewer provenance, and
  keep synthetic fixtures out of production.

## Proposed model

Reuse the existing `foods` → `preparations` → `content_revisions` identity
chain. Stable text IDs and slugs remain repository-owned identifiers; a new
revision is required for accepted changes to approved content. Do not create a
second catalog table or a reviewer-specific copy of food records.

Add a normalized review layer linked to `content_revisions`:

- `catalog_review_cases`: one case per candidate revision, with case status,
  owner decision, created/updated timestamps, and an immutable audit reference.
- `catalog_dimension_reviews`: one row per required dimension—
  `feeding_safety_developmental`, `allergy_restriction`,
  `nutrition_age_stage`, `taxonomy_labeling`—plus conditional
  `visual_accessibility_rights` when a visual exists. Store decision,
  reviewer role, evidence summary, approval/reference ID, review date,
  proposed replacement/addition, notes, and follow-up state separately for
  each dimension.
- `catalog_review_evidence`: reviewer-supplied evidence references linked to a
  dimension and optionally an existing `sources.id`, with the exact field or
  claim path supported. Store references and claims, not private reviewer
  details or generated safety prose.
- `catalog_owner_adjudications`: append-only owner decisions for conflicts,
  including the affected case/dimension, decision, rationale reference, and
  implementation/revision reference.

Lifecycle should be explicit and transition-controlled:

`draft → ready_for_review → in_review → changes_requested → in_review →
approved`, with `blocked` reachable from any non-retired review state and
`retired` represented by the existing append-only retirement event. A record
must not become public because fields are populated; only the existing
publication function may expose an approved, current, non-retired revision
that passes all release gates.

The database should enforce legal transitions through a security-definer
service-role transition function rather than allowing arbitrary status updates.
Existing approved append-only behavior remains unchanged.

## Review and release gates

A candidate is release-eligible only when:

- food, preparation, revision, and slugs have stable non-test identifiers;
- all required dimensions have a recorded decision of `Accept` or
  `Accept with clarification`;
- no dimension is `Block`, `Insufficient evidence`, or unresolved follow-up;
- each required decision has a reviewer role, review date, evidence/reference,
  and owner adjudication where recommendations conflict;
- source/evidence references resolve to immutable, attributable records;
- storage and visual requirements continue to pass the existing release
  pipeline; and
- the record classification is not `fixture`, `seed`, `demo`, or `test`.

The release report should expose rejected case IDs and reasons without
publishing candidate data. Existing public RPCs remain the only application
read path.

## Empty-state behavior

Keep the current Foods empty state and fail-safe unavailable state. Candidate,
draft, blocked, and fixture rows must not appear in Foods, Today, Week, or
planner RPCs. Add an integration assertion that an empty production database
returns zero public items even when test fixtures exist in source files.

## Persistence recommendation

Use the existing Supabase relational persistence and service-role import/review
seams. Keep version-controlled repository files for candidate packages and
review evidence references, using the corrected review schema as the exchange
format. Do not build a reviewer UI, scrape sources, select launch foods, or
add a separate document database in this foundation ticket.

## Dependency-ordered implementation tickets

1. **23A — Add candidate/review schema and transition gates.** Add the tables,
   enums/checks, append-only adjudication/evidence records, transition RPC,
   and a release-eligibility RPC. No production rows.
2. **23B — Extend deterministic import and review-packet validation.** Accept
   candidate records plus per-dimension review evidence, reject missing or
   synthetic classifications, preserve idempotency, and emit rejection reasons.
3. **23C — Connect publication and empty-state regression coverage.** Make
   public publication require the new gate, add integration tests proving
   candidate/fixture isolation, and verify Foods remains empty safely.
4. **23D — Add owner adjudication/review operations documentation.** Document
   conflict resolution, re-review, blocked/unblocked, retirement, and evidence
   retention against the packet and release runbook.
5. **23E — Prepare a separately authorized content-scope decision.** Only after
   the foundation is green should product owners choose candidate foods; this
   is deliberately outside this ticket.

## First implementation ticket acceptance criteria (23A)

- Migration creates candidate review cases, dimension reviews, evidence links,
  and append-only owner adjudications using existing catalog IDs.
- Required dimension values and lifecycle statuses are constrained to explicit
  enums; no general `approved` boolean can bypass them.
- Transition RPC rejects illegal transitions, missing stable IDs, missing
  required dimensions, or transitions that would expose non-approved content.
- Release-eligibility RPC returns deterministic eligible/rejected status and
  machine-readable reasons for every candidate revision.
- Existing `foods`, `preparations`, `content_revisions`, visual, storage, and
  retirement invariants remain intact; approved history is not rewritten.
- No production or seed catalog rows are added, and no synthetic fixture is
  returned by a public catalog query.
- Migration reset, focused database tests, typecheck, lint, and `git diff
  --check` pass.

## Non-goals and risks

- No launch-food selection or safety guidance.
- No reviewer recruitment or private identity storage.
- No automatic authority inference from URLs, blogs, product pages, or model
  output.
- Adding lifecycle states to `content_revisions` may affect the current import
  check constraint and transition assumptions; compatibility tests must cover
  existing `draft`, `in_review`, `approved`, and retirement fixtures.
- Visual review is conditional in the review layer but remains mandatory when
  the existing revision visual requirement says a visual is required.
