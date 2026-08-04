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
- validate each dimension independently rather than imposing a package-wide
  "initial" or "later" mode. A packet may mix first submissions and later
  submissions for different dimensions, and may be partial. For a dimension
  with no current submission, `supersedes_submission_id` must be null. For a
  dimension with a current submission, it must name that exact current tip;
  import order never chooses the effective review;
- require an opaque approval reference for every newly imported qualified
  submission. Persist it in a dedicated immutable one-to-one
  `catalog_review_submission_approval_references` record keyed by submission;
  legacy 23A submissions may remain null for compatibility, and 23B does not
  change 23A eligibility until a separately authorized release gate adopts the
  reference requirement;
- keep missing required dimensions, including storage, as deterministic
  eligibility failures rather than silently filling them. A case cannot
  complete until all five always-required dimensions have a current qualified
  submission; visual review is additionally required only when the candidate's
  authoritative visual metadata requires it;
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
form. The implementation adds a dedicated immutable one-to-one
`catalog_review_submission_approval_references` record because the form
already carries `approval_reference_id` and the 23A submission table does not.
The reference is required for new imported qualified submissions, opaque and
durable, contains no private identity or embedded document, and is nullable
only for legacy 23A rows. It is not used by 23A eligibility until a separately
authorized release gate adopts it.

## Proposed versioned contracts

### Candidate import envelope

The existing package shape remains the `payload`; the envelope adds identity
and import semantics without turning the reviewer form into database transport.

```json
{
  "schema_version": "candidate-package/v1",
  "package_id": "candidate-package-example",
  "package_version": "2026-08-04.1",
  "package_created_at": "2026-08-04T12:00:00Z",
  "classification": "production_candidate",
  "payload_digest": "sha256:<canonical-digest>",
  "review_cases": [
    { "case_id": "case-example", "revision_id": "revision-example" }
  ],
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
  "package_created_at": "2026-08-04T12:00:00Z",
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

The candidate `review_cases` array is required to map each payload revision to
exactly one newly created case; duplicate or missing revision mappings are
rejected. The envelope must not accept `owner_adjudications`, catalog values,
authority definitions, or publication status. The mapping from the existing
reviewer form is explicit: `reviews[*]` becomes submissions,
`evidence_sources` becomes evidence rows, and `approval_reference_id` becomes
the immutable approval-reference child row.

## Canonical digest and idempotency

Create an append-only `catalog_import_receipts` table with:

- `import_kind` (`candidate_package` or `qualified_review_packet`);
- `package_id`, `package_version`, and `schema_version`;
- `payload_digest` (SHA-256 of canonical JSON);
- a deterministic `result_json` containing sorted IDs, counts, and case IDs;
- `package_created_at` from the producer, included in canonical material;
- `recorded_at` for importer audit only, excluded from canonical material; and
- a unique key on `(import_kind, package_id, package_version)`.

RLS is enabled; only `service_role` may inspect receipts, and only the two
import RPCs may write them. An append-only trigger blocks update/delete.

Canonicalization is versioned with the envelope and is deliberately explicit:

1. The transport validator parses UTF-8 JSON with duplicate-object-key
   rejection before conversion to `jsonb`; PostgreSQL `jsonb` cannot preserve
   duplicate keys, so a duplicate-key payload is rejected before the RPC is
   called. The database still recomputes the digest from the parsed value and
   never trusts the caller's digest.
2. The canonical material includes `schema_version`, `package_id`,
   `package_version`, `package_created_at`, `classification`, and the payload
   fields defined by that schema. `payload_digest`, `recorded_at`, and
   `result_json` are excluded. Review envelopes additionally include
   `case_id`, `revision_id`, and all submission/evidence fields.
3. Object keys are sorted by their UTF-8 byte sequence. Strings preserve their
   Unicode code points without normalization; escaping uses the minimal JSON
   escape form. Omitted fields and explicit `null` are distinct and are
   accepted only where the schema explicitly allows both.
4. Numeric values are finite integers only, written as base-10 JSON integers
   with no leading zero, exponent, fraction, or negative zero. A future schema
   that needs fractional values must define a new canonicalization version.
5. Identity-bearing arrays are sorted by stable ID, then by the remaining
   canonical row bytes as a tie-breaker. This applies to `sources`, `tags`,
   `foods`, `preparations`, `revisions`, `visuals`, submissions, evidence,
   `tag_ids`, `visual_ids`, and storage rules. Arrays whose order is meaningful
   are explicitly marked ordered by the schema and retain their order.
6. Serialize compact UTF-8 JSON and hash with SHA-256. The database RPC
   recomputes this exact canonical form; the client-supplied digest is
   advisory and must match the database result.

The database transaction uses this exact sequence for both import RPCs:

1. Validate envelope shape, duplicate IDs, and canonical digest before any
   domain write.
2. Begin the function transaction and take
   `pg_advisory_xact_lock(hashtextextended(import_kind || E'\\0' || package_id
|| E'\\0' || package_version, 0))`.
3. `SELECT ... FOR UPDATE` the receipt for the unique
   `(import_kind, package_id, package_version)` key. An exact existing key and
   digest returns its stored result without any write. The same key with a
   different digest returns `package_digest_conflict` without semantic writes.
4. Run semantic validation, lock any candidate parent rows needed for
   identity comparison, and write domain rows. A stable ID with different
   values returns `record_identity_conflict`.
5. Insert the immutable receipt only after every domain write succeeds, then
   commit. Any validation, domain, or receipt failure rolls back all rows.

The result contains sorted IDs, counts, and case IDs only; it contains no
timestamps, array-order-dependent values, or nondeterministic ordering. Exact
retries therefore return the same stored result, while two concurrent callers
cannot both treat a new package identity as unseen.

## Candidate snapshot integrity

Add a shared `candidate_snapshot_locked(revision_id)` predicate that is true
when a `catalog_review_cases` row exists for the revision. A later review
submission or evidence row is covered automatically by the case foreign key.

Add database triggers that reject update/delete (and child insert/update/delete)
when the target revision is locked. The same guard must run for direct DML and
every existing service mutation path, including `import_catalog_fixture`, the
catalog-release wrapper, and both new import RPCs:

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
transaction, so the snapshot becomes locked at commit. A shared source, tag,
preparation, food, or visual may be reused exactly by other revisions, but any
update/delete or locked-edge change that would alter the meaning of the locked
revision is rejected. Any later correction must create a new candidate revision
and case. The lock remains active for draft, in-review, changes-requested,
blocked, and completed cases. `import_catalog_fixture` remains usable for
unreviewed synthetic fixtures, but fixture updates against a locked revision
must fail safely; add a compatibility regression test for that boundary.
`import_catalog_fixture_unchecked` must not bypass triggers.

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
21. `approval_reference_missing`
22. `invalid_submission_supersession`
23. `duplicate_effective_submission`
24. `conditional_visual_review_missing`
25. `owner_adjudication_forbidden_in_packet`
26. `review_case_completed`
27. `partial_import_rejected`

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
- concurrent conflicting imports serialize so one commits and the other returns
  `package_digest_conflict`;
- duplicate JSON keys, number-format variants, Unicode strings, omitted versus
  null fields, and meaningful-array ordering produce the documented digest;
- public catalog isolation and empty production state;
- snapshot lock prevents later parent/child rewrites.

### Review packet import

- valid atomic packet and exact replay;
- missing, mismatched, expired, and uncovered authority;
- missing evidence;
- cross-case, cross-revision, and cross-dimension references;
- missing approval reference;
- valid supersession, stale-tip rejection, and branching rejection;
- one packet mixing first submissions and later supersessions across dimensions;
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

## Open decisions and resolution gates

The following defaults are part of this design. They are classified so an
implementation cannot accidentally treat an operational question as permission
to weaken a safety or integrity boundary.

| Decision                                               | Default in this plan                                                                                                                                    | Gate                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Approval-reference persistence                         | Dedicated immutable one-to-one child record; required for new imported qualified submissions; nullable only for legacy 23A rows                         | Must be accepted before implementation; not a blocker for merging this design once recorded here |
| Candidate status at import                             | Draft-only, with no caller-supplied `in_review` or publication state                                                                                    | Must be accepted before implementation                                                           |
| Review-round semantics                                 | Per-dimension current-tip/supersession rules; packets may be partial and may mix first/later dimensions; missing dimensions remain eligibility failures | Must be accepted before implementation                                                           |
| Snapshot-lock breadth                                  | Lock revision, all meaning-bearing children, and referenced parent/visual identities at case creation; exact shared reuse is allowed, mutation is not   | Must be accepted before implementation                                                           |
| Canonicalization and receipt concurrency               | Versioned canonical rules above, database recomputation, advisory transaction lock, `FOR UPDATE` receipt lookup, receipt inserted after domain writes   | Must be accepted before implementation                                                           |
| Receipt identity scope                                 | `(import_kind, package_id, package_version)` is unique; the same package identity may be reused across kinds only as a distinct receipt namespace       | Operational confirmation before implementation tests                                             |
| Schema validator dependency                            | Ajv may be added as a development-only validator if implementation needs draft-2020-12 coverage; SQL remains authoritative                              | Implementation-time dependency decision                                                          |
| Reviewer coverage, budget, timing, and delivery format | Use the generic role/source map in this plan; JSON is the canonical packet, with forms/spreadsheets as later collection aids                            | Operational follow-up; never a reason to invent or auto-approve safety content                   |

No unresolved decision is required to merge the documentation-only design PR
after these defaults are reviewed. The first five rows must be explicitly
accepted before any production migration or importer implementation begins.

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
