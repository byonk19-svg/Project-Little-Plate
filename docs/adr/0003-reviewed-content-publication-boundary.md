# ADR 0003: Reviewed content publication boundary

- Status: Accepted
- Date: 2026-07-27
- Scope: Ticket 03 reviewed preparation browsing

## Context

Project Little Plate must make preparation and storage information useful
without allowing draft, incomplete, retired, or unreviewed safety content to
appear as guidance. Approved content must retain the exact source, review, tag,
and storage-rule payload that was reviewed. The project does not yet have a
qualified, production-ready food fixture.

## Decision

- Store sources, controlled tags, foods, preparations, versioned content
  revisions, revision tags, storage rules, and retirements as separate
  relational records.
- Use `draft`, `in_review`, and `approved` as revision workflow states. Record
  retirement separately as an append-only event so the approved historical
  record is not rewritten.
- Make approved revisions and their child tag and storage-rule records
  append-only. Source and tag identifiers are immutable: a deterministic import
  rejects an identifier reused with different data.
- Restrict all curated-content table access and the import function to the
  service role. Caregiver and anonymous clients can read only through two
  security-definer publication functions with fixed, empty search paths.
- Publish only active preparations whose latest selected revision is approved,
  not retired, and has a source, at least one skill tag, at least one allergen
  tag, and at least one explicit storage-support record.
- Represent missing reviewed storage guidance with an explicit `unsupported`
  rule whose deadline, duration, and guidance are all null. Never derive or
  substitute a deadline.
- Keep discard-after safety deadlines, quality guidance, and informational
  storage guidance as distinct rule kinds through the database, query, and UI
  layers.
- Keep the production seed empty until a qualified reviewer supplies and
  approves a source-backed fixture. Automated tests use conspicuously synthetic,
  test-only records.

## Consequences

- Import retries converge without duplicate content, while changed approved
  payloads fail instead of being silently ignored.
- A normal application user cannot inspect draft records through tables or
  change publication state.
- The Foods UI fails closed when a publication query or returned record is
  malformed.
- Retiring content does not destroy the approved historical record, and a later
  replacement requires a new version rather than editing the approved version.
- Ticket 03 proves the complete publication path but ships zero production
  preparations. Human content review remains a release dependency, not an
  implementation shortcut.

## Reversal conditions

Revisit this decision before adding a reviewer console, scheduled review
automation, localization of reviewed copy, or historical rule migration. Any
replacement must preserve source and reviewer provenance, approved-content
immutability, explicit unsupported states, least-privilege publication access,
and deterministic import behavior.
