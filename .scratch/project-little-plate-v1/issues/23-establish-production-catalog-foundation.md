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
  created/updated timestamps, and an immutable audit reference. Case status
  owns `draft`, `ready_for_review`, `in_review`, `changes_requested`,
  `blocked`, and completed review outcomes. It does not replace the
  publication status on `content_revisions`.
- `catalog_review_submissions`: immutable qualified submissions, with multiple
  review rounds permitted for one case and dimension. Each submission records
  the candidate revision actually reviewed, an opaque reviewer authority
  reference, and an optional superseded-submission reference. Historical
  submissions are never overwritten or deleted.
- `catalog_dimension_reviews` (or an equivalent derived view): one effective
  review per required dimension—
  `feeding_safety_developmental`, `allergy_restriction`,
  `nutrition_age_stage`, `taxonomy_labeling`, `storage_handling`, plus
  conditional `visual_accessibility_rights` when a visual exists or is
  required. Derive this view from the current effective qualified submission;
  do not use a mutable one-row approval shortcut.
- `catalog_review_evidence`: reviewer-supplied evidence references linked to a
  dimension and optionally an existing `sources.id`, with the exact field or
  claim path supported. Store references and claims, not private reviewer
  details or generated safety prose.
- `catalog_owner_adjudications`: append-only owner decisions for conflicts,
  including the affected case/dimension, decision, rationale reference, and
  implementation/revision reference.

Lifecycle should be explicit and transition-controlled:

`catalog_review_cases`: `draft → ready_for_review → in_review →
changes_requested → in_review → completed`, with `blocked` reachable from any
non-retired review state and `retired` represented by the existing append-only
retirement event. `content_revisions` retains its existing publication states
(`draft`, `in_review`, `approved`). A review-case transition never publishes a
revision; only the controlled release operation may transition a revision to
`approved` after every gate passes.

The database should enforce legal transitions through a security-definer
service-role transition function rather than allowing arbitrary status updates
or contradictory case/revision states. Existing approved append-only behavior
remains unchanged.

## Review and release gates

A candidate is release-eligible only when:

- food, preparation, revision, and slugs have stable non-test identifiers;
- all required dimensions have a recorded decision of `Accept` or
  `Accept with clarification`;
- no dimension is `Block`, `Insufficient evidence`, `Revise`, or unresolved
  follow-up;
- each required decision has a reviewer role, reviewer authority reference,
  review date, evidence/reference, and owner adjudication where recommendations
  conflict;
- `Accept with clarification` is eligible only when no catalog or
  safety-sensitive value changes, the clarification is recorded, follow-up is
  resolved, and the qualified reviewer marks it non-blocking. Any required
  change creates a new unapproved candidate revision and new qualified review;
- the release owner may choose between compatible qualified recommendations or
  decline/return content, but may not clear `Block`, `Insufficient evidence`,
  `Revise`, or unresolved follow-up. Only a later qualified submission for the
  same dimension can clear a domain block;
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
  immutable review submissions, authority references, and append-only owner
  adjudications using existing catalog IDs.
- Required dimension values and lifecycle statuses are constrained to explicit
  enums, including storage and conditional visual review; no general
  `approved` boolean can bypass them.
- Transition RPC rejects illegal transitions, missing stable IDs, missing
  required dimensions, or transitions that would expose non-approved content.
- Release-eligibility RPC returns deterministic eligible/rejected status and
  machine-readable reasons for every candidate revision.
- Existing `foods`, `preparations`, `content_revisions`, visual, storage, and
  retirement invariants remain intact; approved history is not rewritten.
- Multiple review rounds remain auditable, and effective eligibility is derived
  from the current qualified submission rather than overwriting history.
- No production or seed catalog rows are added, and no synthetic fixture is
  returned by a public catalog query.
- Migration reset, focused database tests, typecheck, lint, and `git diff
  --check` pass.

## Non-goals and risks

- No launch-food selection or safety guidance.
- No reviewer recruitment or private identity storage.
- No automatic authority inference from URLs, blogs, product pages, or model
  output.
- The existing `content_revisions` status constraint supports the three
  publication states `draft`, `in_review`, and `approved`. Preserve those
  states. Add detailed workflow states only to `catalog_review_cases` and test
  compatibility with the existing import and publication functions.
- Visual review is conditional in the review layer but remains mandatory when
  the existing revision visual requirement says a visual is required.
