# Ticket 23B design: deterministic candidate and qualified-review imports

**Status:** design only; no production code, migration, script, or test changes

**Generated:** 2026-08-04

**Base:** `origin/main` at `2369f7a6d968fc6ab3d1e22035d634c6c0f81067`

**Recommended branch:** `codex/ticket-23b-import-design`

## Overview

Ticket 23B should add two service-role-only import boundaries while preserving
the accepted Ticket 23A review contract:

1. A candidate catalog package importer creates an unapproved, stable catalog
   snapshot and one draft `catalog_review_cases` row per candidate revision.
2. A qualified review packet importer appends reviewer submissions and evidence
   to one exact existing candidate revision and case.

The boundaries must not be implemented by widening `import_catalog_fixture`.
That function remains the synthetic-fixture seam. Candidate import owns
repository catalog values; review import owns qualified review records. Neither
operation approves, adjudicates, completes, publishes, or selects launch food.

## Repository facts and current seams

`CONTEXT.md` is absent from this repository. The canonical context is therefore
`AGENTS.md`, `.scratch/project-little-plate-v1/PRD.md`,
`project-little-plate-v1-plan.md`, the local issue, and accepted ADRs.

### Existing catalog persistence

`supabase/migrations/20260727183314_create_reviewed_content_foundation.sql`
defines:

- `sources`, `tags`, `foods`, `preparations`, `content_revisions`;
- `revision_tags`, `storage_rules`, and `content_retirements`;
- approved-revision and approved-parent append-only triggers;
- `public.import_catalog_fixture(jsonb)`; and
- public read seams `list_published_preparations()` and
  `get_published_preparation(text)`.

`content_revisions.status` remains the publication representation
(`draft`, `in_review`, `approved`). It must not be replaced by review-case
status.

### Existing fixture importer and why it is not a production import seam

`public.import_catalog_fixture(jsonb)` first validates selected approved-fixture
requirements, then calls the renamed
`public.import_catalog_fixture_unchecked(jsonb)` in
`supabase/migrations/20260730120000_add_catalog_release_pipeline.sql`.
The underlying importer in the reviewed-content migration:

- inserts sources and tags idempotently by exact-value comparison;
- upserts foods and preparations for non-approved records;
- rewrites non-approved revisions to `draft`, then applies the requested
  status;
- deletes and recreates revision tags and storage rules;
- accepts a `retirements` collection for approved revisions; and
- returns aggregate row counts rather than a package receipt.

The release-pipeline wrapper adds visual and preparation-time handling,
including visual-rights checks, required-visual checks, and approved-child
freezing. It still permits draft evolution and uses the fixture shape. The
unchecked function is revoked from normal roles, but it is intentionally a
fixture/test seam and is exercised directly by database-backed tests.

These semantics are unsafe for candidate/review ingestion because they can
rewrite an existing non-approved row, replace child collections, accept
fixture-oriented status values, and do not create a review case or receipt.
They also have no candidate snapshot lock once a review case exists. 23B must
use a distinct importer with insert-or-exact-match behavior and explicit
review-case creation.

### Existing release and visual/storage seams

`supabase/migrations/20260730120000_add_catalog_release_pipeline.sql` defines:

- `catalog_visuals` with rights basis, license, alt text, and review date;
- `revision_visual_requirements`;
- `revision_visuals`; and
- `revision_catalog_metadata` with preparation-time bands.

The wrapper validates these fields, then delegates catalog rows to the fixture
importer. `storage_rules` remain in the reviewed-content migration and require
an explicit supported/unsupported contract. Candidate import may create these
records only when the package carries the values explicitly; it must never
derive or invent safety values.

### Ticket 23A review boundary

`supabase/migrations/20260803144400_add_catalog_review_schema_gates.sql`
provides the following service-role RPCs:

- `register_catalog_reviewer_authority`;
- `create_catalog_review_case`;
- `submit_catalog_review`;
- `record_catalog_review_evidence`;
- `record_catalog_owner_adjudication`;
- `get_catalog_review_eligibility`; and
- `transition_catalog_review_case`.

The tables are RLS-enabled, directly unreadable except for service-role
inspection, and protected by append-only history triggers. Review cases are
unique per revision. Submissions and evidence are immutable, dimensions are
the six explicit enum values, and owner adjudications are an append-only chain.
No 23B importer may weaken those boundaries or import owner adjudications.

### Existing contracts and validation

- `docs/catalog-review/catalog-package.template.json` is a catalog-content
  shape, currently described as a post-review import shape. It contains
  sources, tags, foods, preparations, revisions, visuals, and retirements.
- `docs/catalog-review/catalog-review.schema.json` is the reviewer-facing
  packet shape. It records one review per dimension and carries reviewer role,
  authority reference, decision, evidence references, storage context, visual
  context, dates, and follow-up.
- `docs/catalog-review/reviewer-authority.template.md` deliberately leaves
  identity and approval references blank and forbids private contact details,
  credentials, and medical notes.
- `scripts/check-catalog-sources.mjs` loads only database-selected release
  sources through `list_catalog_release_sources`, validates HTTPS and DNS
  safety, pins requests to resolved addresses, checks redirects, and reports
  broken sources deterministically. A URL is not authority merely because it
  is reachable.

The integration seams are `tests/integration/reviewed-content-foundation.test.ts`,
`tests/integration/catalog-release-pipeline.test.ts`, and
`tests/integration/catalog-review-schema-gates.test.ts`. Existing E2E suites
also use `import_catalog_fixture` for synthetic data. 23B compatibility tests
must prove those fixtures continue to work without allowing fixture rows into
the candidate/public path.

## Required architecture

### Boundary A: candidate catalog package import

Recommended RPC:

```sql
public.import_catalog_candidate_package(p_envelope jsonb) returns jsonb
```

It is a new `SECURITY DEFINER` function with `set search_path = ''`, executable
only by `service_role`. It should not call the public fixture importer. A
private SQL helper may share field-level validation, but it must not inherit
fixture upsert/delete/status semantics.

Allowed content:

- sources, tags, foods, preparations;
- one or more unapproved draft content revisions;
- revision tags and explicit storage rules;
- visual requirements, visual records, visual associations, and rights
  metadata;
- preparation-time metadata; and
- one `production_candidate` review case per imported revision.

Required behavior:

- require stable IDs, slugs, `schema_version`, `package_id`, and immutable
  `package_version`;
- require `classification = production_candidate` at envelope and record
  levels;
- accept only draft candidate revisions (or an omitted status normalized to
  draft); reject approved, publication metadata, retirements, reviewer
  decisions, authority records, and adjudication fields;
- insert new rows or accept exact existing rows, but never update an existing
  candidate row under the same identity;
- create each review case in `draft` and never transition it to completion;
- never set `approved_at`, publish content, or call a public catalog read path;
- preserve an empty production seed; and
- commit all records and the import receipt atomically.

The candidate importer may be replayed against an existing exact candidate
snapshot. A different package may reuse an exact existing source/tag/parent
record, but a stable ID with different data is a hard identity conflict.

### Boundary B: qualified review packet import

Recommended RPC:

```sql
public.import_catalog_review_packet(p_envelope jsonb) returns jsonb
```

It is also `SECURITY DEFINER`, uses a fixed empty search path, and is
service-role-only. It appends only to an existing case and exact revision.

Allowed content:

- immutable review submissions;
- explicit submission supersession references;
- per-submission evidence references and optional existing `sources.id` links;
- storage support/context;
- conditional visual context;
- reviewer approval/reference IDs; and
- review dates and already-registered authority references.

Required behavior:

- require the case and revision to exist and match exactly;
- require `production_candidate` classification;
- require authority existence, dimension coverage, and date effectiveness;
- require evidence for every imported submission;
- require the five always-required dimensions for an initial packet and a
  required visual submission when authoritative revision metadata requires it;
- allow later packets to add a bounded review round for one or more dimensions,
  while preserving explicit supersession and currentness;
- reject cross-case, cross-revision, cross-dimension, missing-parent, stale-tip,
  and branching supersession;
- reject owner adjudication keys, owner decisions, catalog mutations, and
  automatic completion/publication;
- leave a `blocked` case blocked even when a clearing submission is imported;
  reopening remains an explicit controlled transition; and
- return deterministic results and rejection reports without storing private
  reviewer identity.

The existing reviewer-facing schema remains the form contract. The import
envelope is a transport/identity wrapper around it, not a replacement for the
form. A small additive `approval_reference_id` field on
`catalog_review_submissions` (or an append-only submission-reference child
table) is needed because the form already carries that value and the 23A table
does not. This is an implementation decision to approve before migration.

## Proposed versioned contracts

### Candidate import envelope

The existing package shape remains the `payload`; the envelope adds identity
and import semantics without turning the reviewer form into database transport.

```json
{
  "schema_version": "candidate-package/v1",
  "package_id": "candidate-package-example",
  "package_version": "2026-08-04.1",
  "classification": "production_candidate",
  "payload_digest": "sha256:<canonical-digest>",
  "payload": {
    "sources": [],
    "tags": [],
    "foods": [],
    "preparations": [],
    "revisions": [],
    "visuals": []
  }
}
```

Candidate payload revisions must contain explicit storage/visual metadata but
must omit or null all reviewer/publication fields. `retirements` is forbidden
for this envelope. The database recomputes the digest and rejects a supplied
digest mismatch.

### Review import envelope

The review envelope identifies one exact candidate revision/case and carries
the reviewer-facing review records in a normalized import form:

```json
{
  "schema_version": "qualified-review-packet/v1",
  "package_id": "review-packet-example",
  "package_version": "2026-08-04.1",
  "case_id": "case-example",
  "revision_id": "revision-example",
  "classification": "production_candidate",
  "payload_digest": "sha256:<canonical-digest>",
  "submissions": [
    {
      "id": "submission-example",
      "dimension": "storage_handling",
      "decision": "Accept",
      "reviewer_role": "qualified-role-reference",
      "reviewer_authority_reference": "authority-reference",
      "reviewed_at": "2026-08-04",
      "approval_reference_id": "approval-reference",
      "follow_up_status": "none",
      "clarification_requires_catalog_change": false,
      "storage_support_state": "supported",
      "storage_context": {},
      "visual_context": {},
      "supersedes_submission_id": null,
      "evidence": [
        {
          "id": "evidence-example",
          "field_or_claim": "storage_support_state",
          "evidence_reference": "durable-reference",
          "source_id": "existing-source-id"
        }
      ]
    }
  ]
}
```

The envelope must not accept `owner_adjudications`, catalog values, authority
definitions, or publication status. The mapping from the existing reviewer form
is explicit: `reviews[*]` becomes submissions, `evidence_sources` becomes
evidence rows, and `approval_reference_id` becomes the additive submission
reference field/child table.

## Canonical digest and idempotency

Create an append-only `catalog_import_receipts` table with:

- `import_kind` (`candidate_package` or `qualified_review_packet`);
- `package_id`, `package_version`, and `schema_version`;
- `payload_digest` (SHA-256 of canonical JSON);
- a deterministic `result_json` containing sorted IDs, counts, and case IDs;
- `recorded_at` for audit only; and
- a unique key on `(import_kind, package_id, package_version)`.

RLS is enabled; only `service_role` may inspect receipts, and only the two
import RPCs may write them. An append-only trigger blocks update/delete.

Canonicalization rules:

1. Validate the envelope and reject duplicate stable IDs.
2. Recursively sort object keys.
3. Sort every identity-bearing array by its stable ID (`sources`, `tags`,
   `foods`, `preparations`, `revisions`, `visuals`, submissions, evidence,
   `tag_ids`, `visual_ids`, and storage rules).
4. Serialize compact UTF-8 JSON and hash with SHA-256.
5. Recompute the digest inside the database RPC; the client-supplied digest is
   advisory and must match the database result.

The receipt key is locked before semantic writes. An exact existing key and
digest returns the stored result without writing. The same key with a
different digest returns `package_digest_conflict`. Stable IDs that already
exist with different values return `record_identity_conflict`. The result must
not contain import timestamps, array-order-dependent counts, or nondeterministic
ordering. Exact retries therefore return the same stored result.

The unique receipt key and a transaction-level advisory lock derived from the
import kind/package identity should serialize concurrent duplicate imports.
The transaction must roll back all candidate/review rows if any validation or
receipt step fails.

## Candidate snapshot integrity

Add a shared `candidate_snapshot_locked(revision_id)` predicate that is true
when a `catalog_review_cases` row exists for the revision. A later review
submission or evidence row is covered automatically by the case foreign key.

Add database triggers that reject update/delete (and child insert/update/delete)
when the target revision is locked:

- `content_revisions`;
- `revision_tags`, `storage_rules`, `revision_catalog_metadata`;
- `revision_visual_requirements`, `revision_visuals`;
- `sources` referenced by a locked revision;
- `tags` referenced by a locked revision;
- `preparations` and `foods` reachable from a locked revision; and
- `catalog_visuals` referenced by a locked revision.

The trigger should return a stable `candidate_snapshot_locked` error. It should
also retain the existing stronger approved-content protection. A no-op update
should be rejected rather than treated as an opportunity to hide a rewrite.

Candidate import writes all values before creating the review case in the same
transaction, so the snapshot becomes locked at commit. Any later correction
must create a new candidate revision and case. `import_catalog_fixture` remains
usable for unreviewed synthetic fixtures, but fixture updates against a locked
revision must fail safely; add a compatibility regression test for that
boundary. `import_catalog_fixture_unchecked` must not bypass triggers.

## Lifecycle behavior

| Operation                            | Allowed case effect                                                                              | Forbidden effect                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Candidate import                     | Create case in `draft`                                                                           | No `ready_for_review`, `in_review`, `completed`, approval, or publication |
| Initial review import on `draft`     | After successful writes, `draft -> ready_for_review -> in_review` through the 23A transition RPC | No direct status update                                                   |
| Review import on `ready_for_review`  | `ready_for_review -> in_review` through the transition RPC                                       | No completion/publication                                                 |
| Review import on `in_review`         | Append a new round; status remains `in_review`                                                   | No owner adjudication                                                     |
| Review import on `changes_requested` | Append the required round and then `changes_requested -> in_review`                              | No automatic completion                                                   |
| Review import on `blocked`           | Append a same-lineage clearing round; status remains `blocked`                                   | No automatic reopening                                                    |
| Review import on `completed`         | Exact receipt replay only                                                                        | No new review data under a completed case                                 |

Completion remains an explicit owner-controlled call to
`transition_catalog_review_case` after `get_catalog_review_eligibility` is
inspected. Publication is Ticket 23C and is not part of either importer.

## Validation layers

### JSON/schema layer

Add separate candidate-envelope and review-envelope JSON Schemas under
`docs/catalog-review/`. Preserve `catalog-review.schema.json` as the
reviewer-facing form contract. Add schema-version fixtures and deterministic
canonicalization fixtures. A small Node/TypeScript validation command can use a
JSON Schema validator such as Ajv for contract tests; this is a development
validation aid only, not the security boundary. Do not add a dependency during
this design task.

### Database semantic layer

The import RPCs must repeat all critical checks in SQL: stable identities,
foreign keys, candidate classification, revision/case matching, authority
coverage and dates, evidence, storage/visual requirements, snapshot locks,
supersession lineage, receipts, and lifecycle effects. Do not trust a Node-side
schema check or a caller-provided digest.

### Operational/source layer

Reuse `list_catalog_release_sources` and
`scripts/check-catalog-sources.mjs` for source-link preflight/reporting. Keep
HTTPS/DNS/redirect safety checks, but do not convert a reachable URL into
reviewer authority. Source authority remains an existing, qualified
`catalog_reviewer_authorities` record.

## Stable rejection-code inventory

Use one deterministic ordered rejection list. Preserve existing 23A reason
codes when they represent the same semantic condition.

1. `unsupported_schema_version`
2. `package_identity_missing`
3. `package_digest_conflict`
4. `unstable_identifier`
5. `invalid_classification`
6. `approved_candidate_forbidden`
7. `candidate_status_forbidden`
8. `record_identity_conflict`
9. `unknown_source`
10. `unknown_tag`
11. `invalid_storage_contract`
12. `invalid_visual_contract`
13. `candidate_revision_mismatch`
14. `candidate_snapshot_locked`
15. `review_case_missing`
16. `review_revision_mismatch`
17. `unknown_reviewer_authority`
18. `authority_dimension_mismatch`
19. `authority_not_effective`
20. `missing_review_evidence`
21. `invalid_submission_supersession`
22. `duplicate_effective_submission`
23. `conditional_visual_review_missing`
24. `owner_adjudication_forbidden_in_packet`
25. `review_case_completed`
26. `partial_import_rejected`

Within each collection, sort failures by collection name, stable record ID,
field path, and code. Return the complete ordered list for validation failures;
receipt/digest conflicts may return the single conflict because no semantic
write is attempted. Do not include source contents, private reviewer details,
or generated safety prose in a rejection report.

## Security and privacy plan

- Enable RLS on receipts and any new import-reference tables.
- Revoke table and function access from `PUBLIC`, `anon`, and `authenticated`.
- Grant only `SELECT` inspection to `service_role`; writes occur through the
  import RPCs.
- Use `SECURITY DEFINER` with `set search_path = ''` and schema-qualified
  objects.
- Keep receipts to package identity, digest, deterministic counts/IDs, codes,
  and references. Reject names, email addresses, credentials, medical notes,
  reaction histories, and caregiver data from import envelopes.
- Do not expose candidate rows through `list_published_catalog_items`,
  `list_published_preparations`, `get_published_preparation`, or application
  query modules.
- Preserve append-only receipts, candidate snapshot values, submissions, and
  evidence. Corrections are new revisions or new review rounds.

## Dependency-ordered implementation plan

### Sprint 1 — contracts and deterministic primitives

1. Add candidate and review import-envelope schemas and examples under
   `docs/catalog-review/`; keep the reviewer form schema unchanged.
2. Add a pure canonicalization/digest module under
   `src/modules/catalog-import/` with array-order invariance tests.
3. Add a validation command under `scripts/` and contract fixtures. Use Ajv
   only as a dev-time schema validator if the implementation confirms it is
   justified; never rely on it for database safety.

**Validation:** schema-valid/invalid fixtures, digest golden tests, duplicate-ID
tests, deterministic rejection ordering, and `pnpm test:catalog-sources`.

### Sprint 2 — receipt and candidate snapshot migration

1. Add `catalog_import_receipts` and any submission-reference table with enums,
   RLS, service-only grants, append-only triggers, and unique receipt keys.
2. Add the shared snapshot-lock predicate/triggers across revision, child, and
   referenced parent tables.
3. Add a private candidate row validation helper that never performs fixture
   upserts or child deletion.

**Validation:** clean reset, RLS tests, direct service-role mutation denial,
parent/child lock tests, and migration lint/advisors.

### Sprint 3 — candidate package importer

1. Implement `import_catalog_candidate_package(jsonb)` with receipt locking,
   canonical digest verification, deterministic insert-or-exact-match behavior,
   candidate-only classification, and atomic case creation.
2. Return sorted deterministic result IDs/counts and stable rejection reports.
3. Prove no public catalog exposure and no seed mutation.

**Validation:** valid import, exact replay, digest conflict, identity conflict,
all forbidden classifications/statuses, unknown references, late rollback,
concurrent duplicate import, and snapshot lock start.

### Sprint 4 — qualified review packet importer

1. Add the additive approval/reference storage decision and immutable packet
   mapping.
2. Implement `import_catalog_review_packet(jsonb)` with exact case/revision
   matching, authority/evidence/date checks, storage/visual completeness,
   supersession locking, receipt idempotency, and no owner-adjudication keys.
3. Use the existing 23A transition RPC for only draft/ready/changes-requested
   to in-review effects; leave blocked and completed cases unchanged.

**Validation:** valid/replay/conflict import, authority and evidence failures,
cross-reference failures, multi-round review, required storage/visual,
candidate immutability, no completion/publication, rollback, and concurrency.

### Sprint 5 — compatibility and operational handoff

1. Keep fixture tests on `import_catalog_fixture`; add an explicit locked-
   snapshot rejection test.
2. Add compatibility assertions for 23A eligibility, public catalog RPCs,
   approved-history protections, empty seed, and source checks.
3. Update the issue with evidence, remaining risks, and the implementation
   commit sequence. Create an ADR only if the final implementation changes a
   durable ownership or import boundary beyond this plan.

**Validation:** `pnpm verify`, clean Supabase reset, database lint/advisors,
`git diff --check`, and the complete focused import suite.

## Acceptance criteria for the first 23B implementation slice

- Candidate and review import RPCs are distinct service-role-only seams.
- Candidate package import is versioned, canonical-digest checked,
  production-candidate-only, atomic, deterministic, idempotent, and draft-only.
- Review packet import targets one exact existing case/revision, appends only
  qualified submissions/evidence, validates authority/evidence/storage/visual
  requirements, supports explicit multi-round supersession, and is atomic and
  idempotent.
- Neither importer can import owner adjudications, complete a case, approve a
  revision, publish content, or choose launch foods.
- A review case locks the candidate snapshot across revision, child, and
  meaning-bearing parent/visual identities; required corrections use a new
  candidate revision.
- Existing fixture importer tests continue to pass for unreviewed fixtures and
  fail closed against locked candidate snapshots.
- Public catalog RPCs remain unchanged and return no candidate data.
- Receipts and imported review history are append-only and private.
- All listed rejection codes, deterministic ordering, rollback, and concurrent
  duplicate behavior are directly tested.

## Test matrix for implementation

### Candidate import

- valid atomic package and one draft case per revision;
- exact replay returns the stored result;
- package digest conflict;
- stable ID reused with changed data;
- production/fixture/test/demo/seed classification rejection;
- approved or non-draft revision rejection;
- unknown source, tag, visual, and invalid slug/ID;
- storage and visual contract failures;
- late failure rolls back every table and receipt;
- concurrent duplicate import serializes to one result;
- public catalog isolation and empty production state;
- snapshot lock prevents later parent/child rewrites.

### Review packet import

- valid atomic packet and exact replay;
- missing, mismatched, expired, and uncovered authority;
- missing evidence;
- cross-case, cross-revision, and cross-dimension references;
- valid supersession, stale-tip rejection, and branching rejection;
- multiple review rounds;
- required storage and conditional visual review;
- no candidate mutation;
- no owner adjudication, completion, approval, or publication;
- late rollback and concurrent duplicate import.

### Compatibility

- existing synthetic fixture importer still works for unlocked fixtures;
- fixture import against a locked revision is rejected;
- approved-history invariants remain intact;
- existing publication RPC outputs remain unchanged;
- Ticket 23A eligibility remains deterministic;
- no seed or production records are added.

## Reviewer coverage workstream (non-code)

This is a coverage map, not an approval roster. No names, credentials, contact
details, medical notes, or private documents belong in the repository. The owner
should obtain quotes and review terms directly before any real packet is
created.

| Dimension                   | Coverage candidate                                                                  | Public authority/evidence artifact                              | Packet format question                                     |
| --------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| Feeding/developmental       | Pediatric feeding/swallowing specialist or interprofessional pediatric feeding team | Public professional scope plus a durable review reference       | Structured JSON/form with exact preparation fields         |
| Allergy/restriction         | Allergy/immunology clinician or qualified allergy organization                      | Public clinical authority basis plus dated review record        | Structured JSON with restriction/allergen claims separated |
| Nutrition/stage             | Pediatric registered dietitian or pediatric nutrition service                       | Public professional credential/scope plus dated review record   | Structured JSON; no individualized medical advice          |
| Taxonomy/labeling           | Content/domain reviewer with product owner acceptance                               | Internal taxonomy decision record and change rationale          | Form or spreadsheet may be acceptable for naming review    |
| Storage/handling            | Food-safety professional or authoritative food-safety organization                  | Public food-safety source and dated reviewer decision           | Structured JSON with explicit support/unsupported state    |
| Visual accessibility/rights | Accessibility specialist plus rights/licensing reviewer, conditional                | WCAG reference, license/rights evidence, alt-text review record | JSON plus license metadata; no private asset documents     |

Preliminary public sources to investigate, without treating them as automatic
review authority:

- ASHA's pediatric feeding and swallowing practice portal describes the
  pediatric feeding/swallowing scope and interprofessional role:
  <https://www.asha.org/practice-portal/clinical-topics/pediatric-feeding-and-swallowing/>.
- AAAAI provides public food-allergy information and specialist pathways:
  <https://www.aaaai.org/tools-for-the-public/conditions-library/allergies/food-intolerance>.
- USDA FSIS publishes food-storage and refrigeration safety references:
  <https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/refrigeration>.
- W3C WCAG 2.2 is the accessibility standard reference for text alternatives
  and accessible web content:
  <https://www.w3.org/TR/WCAG22/>.
- Creative Commons documents attribution and license metadata practices:
  <https://wiki.creativecommons.org/wiki/Attribution>.

The current repository does not have enough evidence to name a reviewer,
promise a cost, or promise a turnaround. Owner approval is required for:

- whether one organization may cover multiple dimensions;
- acceptable authority evidence and validity periods;
- per-dimension quote, turnaround, and packet format;
- emergency re-review and expiry policy; and
- whether taxonomy and visual-rights review are internal or external.

## Open decisions requiring owner approval

1. Add `approval_reference_id` directly to submissions or normalize it into an
   append-only reference child table.
2. Confirm candidate revision status is draft-only at import, rather than
   allowing an explicit unapproved `in_review` payload.
3. Confirm initial review packets must contain all five always-required
   dimensions in one envelope, with later packets allowed to be partial rounds.
4. Approve the snapshot lock at case creation, including parent identities
   shared by multiple revisions.
5. Approve receipt scope and whether the same package identity may be reused
   across different import kinds.
6. Approve Ajv as a dev-only schema-contract dependency if the implementation
   needs full draft-2020-12 validation.
7. Approve reviewer coverage roles, public evidence requirements, quote budget,
   turnaround expectations, and review formats before real content is sent.

## Risks and rollback plan

- A too-broad parent lock could block unrelated unreviewed candidates that
  share a source/tag. Mitigate by allowing exact reuse but rejecting mutation;
  require new identity when meaning changes.
- A too-permissive receipt replay could hide changed payloads. Mitigate with a
  database recomputed digest and unique package key.
- Review imports could accidentally make a blocked case appear recoverable.
  Leave blocked status unchanged and require the 23A transition RPC.
- JSON schema and SQL could drift. Keep golden contract fixtures and run both
  validators; SQL remains authoritative.
- Source checks could be mistaken for authority. Keep operational source
  validation separate from qualified reviewer authority.

Rollback is forward-only: revoke the new RPC grants or disable import callers,
preserve receipts/history, and create corrected revisions rather than deleting
or rewriting imported data. Do not revert an applied migration or add candidate
rows to seed.
