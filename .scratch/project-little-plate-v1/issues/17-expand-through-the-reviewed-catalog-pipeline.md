# 17 - Expand through the reviewed catalog pipeline

**What to build:** Grow the catalog to the closed-beta target exclusively through the validated review and publication pipeline, with every launch-ready food meeting the same provenance and application QA bar as the first vertical slice.

**Blocked by:** 03 - Browse one reviewed preparation.

**External gate:** Qualified reviewers must supply or approve the safety-critical content. An implementation agent must not manufacture missing guidance.

**Status:** ready-for-human

- [ ] Import 40 to 60 foods only from structured records that have completed the required qualified review.
- [ ] Every launch-ready food has at least one skill-compatible approved preparation, restriction/choking review, allergen metadata, source attribution, and explicit storage support or unsupported state.
- [x] Invalid, incomplete, overdue-for-new-publication, or unapproved records fail validation and remain unavailable.
- [x] Import remains deterministic, idempotent, and reviewable as version-controlled data.
- [x] Existing approved revisions and historical deadline references are not silently rewritten.
- [x] Source-link checks identify broken or inaccessible references before release.
- [ ] Required visuals have original/license records and meaningful alt text.
- [x] Foods browsing, filtering, and detail remain responsive at the target catalog size.
- [ ] Representative content QA covers every category, common allergen metadata, supported deadline type, and unsupported state.
- [x] No food is marked launch-ready solely to meet a catalog-size target.
- [x] Update this issue with import results, rejected-record reasons, reviewer evidence locations, and the final launch-ready count.

## Stop-condition audit

Ticket 17's engineering pipeline is complete, but it cannot import or publish
production content without violating the repository's non-negotiable safety
boundary. No qualified reviewed catalog package or reviewer-evidence location
is present in the repository.

`CONTEXT.md` is absent at the repository root. The issue, PRD, plan, accepted
ADRs, and live reviewed-content implementation were used for this audit.

After a clean `pnpm supabase:reset`, the committed migration-and-seed path
contains:

- 0 foods;
- 0 approved revisions;
- 0 published preparations; and
- 0 sources.

`supabase/seed.sql` intentionally contains no product or safety-content
fixtures. ADR 0003 explicitly keeps that seed empty until qualified reviewers
supply and approve a source-backed fixture. Repository search found no
qualified-review approval record, catalog import package, visual-license
manifest, or production source list.

## Acceptance status

- **Blocked:** Import 40 to 60 foods. Final launch-ready count is **0**.
- **Blocked:** Per-food preparation, restriction/choking, allergen, source,
  storage-support, visual, and alt-text QA. There are no candidate production
  records to evaluate.
- **Ready, awaiting real inputs:** `pnpm catalog:check-sources` performs
  deterministic HEAD checks with GET fallback and returns a failing report for
  inaccessible references. The clean production catalog currently has zero
  URLs to check.
- **Blocked:** Representative category/allergen/deadline/unsupported-state QA
  for the real package. Synthetic test fixtures cannot be counted as
  launch-ready content or substituted for reviewer-approved records.
- **Engineering evidence only:** a 50-food synthetic package imports and
  retries deterministically, exercises supported and unsupported storage,
  category, skill, allergen, required-visual, license/rights, alt-text, and
  structural target-shape reporting, and remains test-only. The report always
  returns `beta_ready: false` and records no external approval.
- **Complete safety enforcement:** invalid, incomplete, unapproved, and
  overdue-for-new-publication records stay unavailable; visual records and
  approved association sets are immutable while draft associations remain
  replaceable; retirement and historical deadline provenance remain unchanged.
- **Complete Foods engineering evidence:** search, category, reviewed
  skill-tag, allergen-metadata, familiarity, caller-specific skill
  compatibility, reviewed preparation-time, and storage-support filters are
  deterministic over a synthetic 60-item set. A mobile browser exercises the
  target-size list, filtering, fail-safe unsupported detail, and reviewed
  visual alt-text/rights rendering. Production representative QA remains
  blocked on the qualified package.

## Import and rejection results

- Import attempted: **no**. Importing agent-authored safety data would violate
  the external gate.
- Imported foods: **0**.
- Rejected production records: **0** because no production package was
  supplied.
- Reviewer evidence location: **not supplied**.
- Visual/license evidence location: **not supplied**.
- Final launch-ready count: **0**.

## Exact unblock requirements

An authorized owner must provide a version-controlled structured catalog
package containing 40 to 60 candidate foods and the qualified-review evidence
location. Each record must include the reviewed preparation and safety fields,
controlled skill/allergen metadata, source metadata, review/approval dates,
next-review date, reviewed preparation-time band, explicit storage support and
visual-requirement states, and any required visual's original/license record
and meaningful alt text.

Before import, the owner must also record who may approve, retire, or suspend
content; the applicable pediatric dietitian, pediatric feeding-specialist, and
clinician/allergy review evidence; the field/category-to-reviewer authority
mapping; and the policy and owner for overdue approved content. A nonempty
free-text `reviewer_role` alone is not accepted as proof of authority.

Once supplied, rerun the import from a clean database, record every rejected
record and reason, check each source link, run content validation and the full
repository verification gate, exercise representative category and storage
states in the browser, measure Foods browsing at the target size, and record
the resulting launch-ready count here.

## Remaining risk

The closed-beta catalog gate is not met. Test-only synthetic records created by
integration or browser suites must never be reported as production foods.

## Engineering evidence and changed artifacts

- Migration `20260730120000_add_catalog_release_pipeline.sql` adds atomic
  overdue-new-publication validation, immutable visual rights/alt-text records,
  reviewed preparation-time metadata, explicit visual requirements, a
  service-role release report, and caller-derived familiarity/skill context
  behind the Ticket 16 retirement barrier. Existing approved content lacking
  the new declarations becomes unavailable and requires a new reviewed
  revision; no values are backfilled.
- `scripts/check-catalog-sources.mjs` and its Node tests implement deterministic
  current-candidate source monitoring without embedding credentials or source
  content. Requests reject private/local addresses, pin DNS resolution, and
  revalidate redirects.
- Foods adds accessible search and structured category, skill, allergen, and
  storage filters without inventing preparation-time or familiarity data.
- `docs/operations/catalog-release.md` records the release sequence and full
  external authority contract.
- Clean migration reset passed with 16 migrations.
- Catalog source unit tests passed, 6 tests.
- Catalog filter unit tests passed, including deterministic 60-item coverage.
- Focused catalog integration passed, 5 tests, after a clean 16-migration reset.
- Ticket 03 reviewed-content compatibility plus Ticket 17 catalog integration
  passed together, 15 tests, after a clean 16-migration reset. This includes
  approve-then-retire fixtures and superseded-revision reporting.
- Focused mobile Chromium Foods coverage passed, 2 tests against 60 published
  synthetic preparations; the reviewed SVG returned a positive
  `naturalWidth`.
- Both final review axes reported no remaining actionable findings after the
  staging-order and latest-revision fixes.
- `pnpm verify` passed formatting, lint, typecheck, 113 unit tests, 6 catalog
  source-checker tests, the production build, the clean 16-migration database
  rebuild, the Ticket 17 integration file, and the reviewed-content foundation
  file. It then failed in the pre-existing Ticket 06 refrigerated-batch file:
  a fixture created at `2026-07-28T12:00:00Z` now has a reviewed 24-hour
  deadline of `2026-07-29T12:00:00Z`, which is in the past at verification
  time. Six primary/cascade assertions consequently observe expired or absent
  batch state. Ticket 17 changes only add explicit visual/preparation-time
  metadata to that fixture and do not alter its dates or storage behavior.
- Supabase database lint returned no schema errors; database advisors returned
  no issues.
- After a clean local reset, `pnpm catalog:check-sources` checked 0 release
  candidate URLs and found 0 broken URLs, matching the intentionally empty
  production seed.
- `git diff --check` and `git diff --cached --check` passed.

## Verification limitation

The repository-wide gate is blocked by the unrelated, wall-clock-sensitive
Ticket 06 integration fixture described above. Rewriting that historical
fixture is outside Ticket 17's catalog-pipeline scope and is not included in
this commit. All Ticket 17-specific tests, its upstream Ticket 03 compatibility
seam, database validation, source checking, build/type/lint checks, and
two-axis review are green.
