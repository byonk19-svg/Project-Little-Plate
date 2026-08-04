# 23 - Establish the production catalog foundation

**What to build:** Establish the technical structure for real candidate catalog
records and qualified review without selecting launch foods or creating any
safety-sensitive values.

**Blocked by:** None - Ticket 17 remains `ready-for-human`; its human review is not a prerequisite for the 23A schema gate.

**Status:** ready-for-human

**Current slice:** Ticket 23A merged in `2369f7a`; Ticket 23B is the proposed
current slice. Ticket 23C-23E remain intentionally out of scope.

**23A merge evidence:** PR #3 was squash-merged into `main` as
`2369f7a6d968fc6ab3d1e22035d634c6c0f81067`; GitHub Verify passed on the final
branch head. The merged change contains no production catalog content.

## Ticket 23A implementation evidence

- Migration: `supabase/migrations/20260803144400_add_catalog_review_schema_gates.sql`.
- Durable boundary: `docs/adr/0018-catalog-review-schema-gates.md`.
- Review persistence is linked to the existing `foods` → `preparations` → `content_revisions` identity chain. It adds reviewer authority references and covered dimensions, one `catalog_review_cases` row per candidate revision, append-only case events, immutable submissions and evidence, and append-only owner adjudications. No production or seed catalog rows were added.
- The six dimensions are constrained to `feeding_safety_developmental`, `allergy_restriction`, `nutrition_age_stage`, `taxonomy_labeling`, `storage_handling`, and conditional `visual_accessibility_rights`. Storage reviews require an explicit support state; visual review is required when the existing revision metadata requires it or a visual is associated.
- Service-role-only RPCs register authorities, create cases, submit reviews, record evidence/adjudications, compute eligibility, and transition cases. Direct table writes are denied; history triggers reject mutation/deletion, and qualified submissions require explicit supersession for a later effective review.
- Legal transitions are `draft → ready_for_review → in_review`; from `in_review`, `changes_requested`, `blocked`, or eligible `completed`; `changes_requested → in_review|blocked`; `blocked → in_review` only after a later submission. Case completion never publishes a revision.
- `get_catalog_review_eligibility` returns deterministic machine-readable reasons including missing dimensions, missing qualified authority/evidence, domain block, insufficient evidence, revise, unresolved follow-up, clarification requiring catalog change, missing conditional visual review, synthetic classification, contradictory lifecycle state, and missing stable identifiers. Owner adjudication cannot clear a qualified domain block.
- Integration coverage is in `tests/integration/catalog-review-schema-gates.test.ts`: anonymous read/function denial, legal/illegal transitions, stable reason codes, authority and evidence gates, conditional visual behavior, domain blocks, unresolved/clarification outcomes, immutable history, and explicit supersession.
- Validation evidence: local Supabase reset and the focused six-test integration suite pass. Production remains empty and fixture data is runtime-only synthetic input; no public catalog read path was changed.

Remaining validation and risk are recorded at handoff: full repository verification is still run on this branch, and local Supabase/Docker behavior is environment-dependent even though the migration reset is currently healthy.

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
changes_requested → in_review → completed`, with `blocked` reachable from
`in_review` or `changes_requested` as a qualified-review outcome, and `retired` represented by the existing append-only
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

## Independent-review correction evidence

- Shared PostgreSQL enums now back case status, review dimension, and qualified review decision columns; `content_revisions.status` remains unchanged.
- Eligibility resolves compatible current-review conflicts only through one append-only adjudication selecting an exact current eligible submission. Domain-disqualifying reviews remain absolute; invalid or missing adjudication returns `conflicting_qualified_reviews` with `owner_adjudication_missing` detail or `owner_adjudication_invalid`.
- The focused suite covers compatible conflict resolution, blocked-domain refusal, conditional visual review, and unchanged public catalog RPC isolation. Migration reset and the focused 8-test suite pass; a clean reset was separately checked against the catalog tables and enum metadata before fixture import.
- Full integration passes after a clean reset: 10 files, 75 tests. Unit, lint, typecheck, catalog-source checks, build, database lint, and security advisors pass. Direct Playwright runs 18/19 tests; the sole failure is the pre-existing local-email-delivery expectation because the local inbox is configured and the UI correctly includes the captured-link affordance.
- Ticket 23B and later 23C–23E slices remain unimplemented.

### Final correctness correction evidence

- Owner adjudications now form an append-only chain with one root and at most one successor per predecessor. Eligibility uses only the chain tip; stale selections remain invalid until a later explicit adjudication supersedes the tip.
- `blocked` requires a current unsuperseded `Block`; reopening requires qualified same-dimension, same-lineage clearing submissions for every historical blocker. The clearing set is `Accept` or non-blocking `Accept with clarification` with resolved follow-up, required evidence, valid authority, and no catalog change.
- Entering `blocked` now also requires the current `Block` submission to have effective authority coverage and recorded evidence; the focused suite covers rejection of a dimension-mismatched authority blocker.
- Packet classification now includes `production_candidate`, matching the database candidate boundary. Enum metadata assertions inspect PostgreSQL catalog types directly.

## Ticket 23B proposed handoff

The grounded design is recorded in
`docs/superpowers/plans/2026-08-04-ticket-23b-import-design.md`.

The proposed 23B slice adds two separate service-role import boundaries:

- Candidate package import creates stable, unapproved candidate catalog rows
  and draft review cases. It never imports review decisions, owner
  adjudications, approval, or publication.
- Qualified review packet import appends submissions and evidence against one
  exact existing candidate revision/case. It never mutates catalog values,
  creates authority, adjudicates, completes, or publishes.

Both imports require versioned envelopes, canonical payload digests, append-only
receipts, atomic transactions, deterministic rejection reports, and explicit
idempotency. A review case locks the candidate snapshot; corrections require a
new candidate revision rather than rewriting reviewed values under the same ID.

Ticket 23B remains design-only until the implementation-gate decisions recorded
in the plan are explicitly accepted. The design now fixes the defaults for the
import envelope, dedicated approval-reference persistence for new imported
submissions, snapshot-lock breadth, per-dimension first/later packet semantics,
canonicalization and receipt concurrency. Schema-validator choice and reviewer
coverage/budget/format remain implementation or operational follow-up and do
not authorize production safety content.

### 23B design-review correction evidence

- Initial read-only review classified the design as requiring minor fixes because
  packet completeness was described as a package-wide mode, approval-reference
  persistence was unresolved, canonicalization omitted exact number/string/null
  rules, and receipt locking lacked a complete transaction sequence.
- The design plan now records per-dimension current-tip semantics, partial and
  mixed-round packets, a dedicated immutable approval-reference child record,
  explicit canonical material and serialization rules, and advisory-lock plus
  `FOR UPDATE` receipt ordering before domain writes.
- The plan also records candidate-to-case mappings, shared-parent snapshot-lock
  behavior, stable `approval_reference_missing` rejection handling, concurrent
  conflicting-import tests, and a classified decision table separating
  implementation gates from operational follow-up.
- A fresh post-correction review found two minor contract ambiguities: the
  obsolete `partial_import_rejected` code and missing explicit lifecycle tests
  for blocked-case non-reopening and completed-case replay-only behavior. The
  code was removed and both lifecycle assertions were added to the plan.
- No production code, migration, seed data, reviewer identity, or Ticket 23C-E
  implementation artifact changed in this correction. Ticket 23C-23E remain
  out of scope.

### Ticket 23B local implementation evidence

Implemented locally on `codex/ticket-23b-import` from merged `550779a`.

- Added versioned candidate and qualified-review JSON schemas plus deterministic
  UTF-8 canonicalization, duplicate-key transport rejection, safe-integer
  validation, and SHA-256 digest helpers in `src/modules/catalog-import/`.
- Added append-only import receipts, immutable approval-reference children,
  service-role-only access, candidate snapshot locks, and SECURITY DEFINER
  helpers in `20260804162859_catalog_import_foundation.sql`.
- Added `import_catalog_candidate_package(jsonb)`: exact insert-or-match for
  source-backed candidate parents, draft revisions, storage/visual metadata,
  one-to-one candidate cases, deterministic results, receipt replay, advisory
  locking, and rejection of approved/publication fields.
- Added `import_catalog_review_packet(jsonb)`: exact candidate case/revision
  binding, valid dated authority coverage, one-or-more evidence records,
  dedicated approval-reference persistence, first/later round tip checks,
  atomic insertion, deterministic replay, and draft/changes-requested
  transitions only to `in_review`. It cannot adjudicate, complete, publish, or
  reopen a blocked case.
- Added focused real-local-Supabase integration coverage for concurrent
  candidate replay, candidate snapshot mutation rejection, digest/classification
  failures, public read isolation, qualified review import, evidence,
  approval-reference persistence, and replay.
- No production rows, seed data, UI/auth/email behavior, publication gating, or
  Ticket 23C implementation was added.

Validation evidence: migration reset passed; focused import integration passed
(3 tests); typecheck and lint passed; unit suite passed (17 files, 128 tests);
catalog-source checks passed; production build passed; clean-reset full
integration passed (11 files, 78 tests); database lint and advisors reported no
issues; and Playwright passed all 19 end-to-end tests. `git diff --check` is
clean. The implementation remains local-only; no push or PR was performed.
