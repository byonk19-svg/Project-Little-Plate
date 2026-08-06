# Ticket 23E — Private ten-food pilot content scope

This is a supplemental Ticket 23E specification. The feature-level product
requirements remain in `.scratch/project-little-plate-v1/PRD.md`.

## Problem Statement

The production catalog foundation can now accept and evaluate reviewed
candidate records, but the product does not yet have an approved content scope
for its first validation release. Choosing foods casually would create pressure
to publish incomplete or weakly supported safety content, while leaving the
scope undefined makes it difficult to plan qualified review, testing, and the
closed-beta gate.

The product needs a deliberately small, private pilot that exercises the
reviewed catalog pipeline without turning synthetic fixtures into production
content or opening access to external caregivers before the evidence required by
Ticket 18 exists.

## Solution

Define a private pilot release containing exactly 10 foods. The selection is a
balanced pilot mix across the approved food categories and review scenarios, so
the pilot exercises taxonomy, allergen and restriction metadata, nutrition and
age/stage representation, feeding safety and developmental suitability,
storage/handling, and conditional visual accessibility/rights review. The mix
is selected for coverage rather than popularity. The scope records only the
existing PRD identity targets and planning buckets; qualified category values
and all safety-sensitive fields remain reviewer-supplied.

Every pilot food must have complete, qualified, source-backed evidence for each
applicable review dimension. Authority coverage is role-based and privacy-safe:
the release records qualified authority references and evidence locations, not
private reviewer names, contact details, or medical notes. Missing evidence,
unsupported authority, or an unresolved qualified-review block makes the food
unavailable for release. There is no owner waiver for a missing safety,
storage, allergen/developmental, source, or applicable visual-rights/alt-text
requirement.

The first release is private. It is visible only to the owner and explicitly
authorized testers while workflow, accessibility, and performance evidence are
collected. External caregiver access remains blocked until the closed-beta
evidence in Ticket 18 is complete, including real dogfood, qualified
content/clinical approvals, privacy/legal review, populated accessibility and
representative performance evidence, and a named go/no-go owner with rollback
authority.

## User Stories

1. As the release owner, I want a fixed ten-food pilot scope, so that the first
   release is small enough to review and validate deliberately.
2. As the release owner, I want the ten foods selected as a balanced mix across
   approved categories and review scenarios, so that the pilot exercises the
   pipeline instead of reflecting popularity or convenience.
3. As a qualified reviewer, I want each applicable review dimension to have an
   explicit authority reference and evidence location, so that my recommendation
   is attributable without storing unnecessary private identity data.
4. As a qualified reviewer, I want storage and handling requirements represented
   explicitly, so that a food cannot pass while its storage evidence is absent.
5. As a qualified reviewer, I want conditional visual accessibility and rights
   review to be required when applicable, so that associated visuals cannot
   bypass rights or alt-text evidence.
6. As a qualified reviewer, I want missing, contradictory, or unsupported
   evidence to block release, so that schedule pressure cannot turn uncertainty
   into parent-facing guidance.
7. As the release owner, I want owner adjudication limited to implementation
   choices among compatible qualified recommendations, so that ownership cannot
   replace or override required domain review.
8. As the release owner, I want an explicit private-pilot status, so that
   candidate records are not mistaken for a public launch.
9. As an authorized tester, I want to exercise parent-facing Foods, Today, Week,
   feeding-eligibility, planner, and manual-meal-planning paths against the pilot,
   so that the release is tested through the same boundaries caregivers use.
10. As an authorized tester, I want unsupported or blocked foods to remain
    unavailable in every parent-facing path, so that one read path cannot leak
    an ineligible record.
11. As the release owner, I want to record accessibility checks on populated
    pilot states, so that an empty-state-only audit cannot stand in for the pilot
    experience.
12. As the release owner, I want representative performance evidence for the
    populated pilot, so that local synthetic timings are not mistaken for real
    caregiver readiness.
13. As the release owner, I want every pilot food to pass parent-facing read
    paths before expansion, so that a qualified database record is not treated as
    a complete product experience.
14. As the release owner, I want P0/P1 safety and core-workflow defects to block
    expansion until resolved and regression-tested, so that the pilot has a
    concrete safety stop condition.
15. As the release owner, I want an explicit expand-or-stop decision with a
    named rollback authority, so that expansion is a deliberate reversible
    decision rather than a calendar event.
16. As an external caregiver, I want access to remain blocked while closed-beta
    evidence is incomplete, so that I am not exposed to an unproven or
    incompletely reviewed catalog.
17. As a maintainer, I want the pilot scope, evidence requirements, and stop
    conditions documented, so that future implementation work can be audited
    against one stable contract.
18. As a maintainer, I want production seed and public catalog data to remain
    empty until the separately authorized content-import and publication work is
    complete, so that fixtures cannot silently become launch content.

## Implementation Decisions

- The release scope is exactly 10 foods. It is a private validation release,
  not the eventual 40–60-food catalog and not an external beta.
- Selection uses the balanced pilot mix glossary term: coverage across approved
  categories and review scenarios, not popularity.
- The scope decision does not itself select, invent, or populate safety-critical
  food values. Candidate packages must use reviewed, source-backed material and
  remain separate from synthetic fixtures.
- Role-based approval coverage is required for every applicable review
  dimension. Authority references and evidence locations must be privacy-safe;
  private reviewer contact or medical details are not part of the release
  contract.
- The release is fail closed. Missing source, storage, allergen/developmental,
  or applicable visual-rights/alt-text evidence blocks publication and cannot be
  waived by the owner.
- The owner may adjudicate implementation choices among compatible qualified
  recommendations, but cannot clear a qualified domain block or replace
  required qualified review.
- The first pilot is private to the owner and explicitly authorized testers.
  External caregiver access remains blocked until Ticket 18 evidence is
  complete.
- Expansion requires all ten foods to pass parent-facing reads, no unresolved
  P0/P1 safety or core-workflow defects, complete qualified evidence, populated
  accessibility checks, representative performance evidence, and an explicit
  owner expand/stop decision with rollback authority.
- The highest-value behavioral seam is the existing release-eligibility and
  controlled-publication boundary. Parent-facing read paths should consume that
  boundary rather than adding per-screen exceptions.
- Verification should use the existing database integration seams for
  eligibility, publication, isolation, and lifecycle behavior, plus focused
  browser coverage over populated private-pilot states. No reviewer UI, new
  auth model, or second catalog store is introduced by this scope decision.

## Testing Decisions

- Tests assert external behavior at the release and read boundaries, not table
  implementation details.
- A complete pilot record is eligible only when every applicable dimension has
  qualified, source-backed evidence and any conditional visual requirement is
  satisfied.
- Missing or unsupported evidence must produce a deterministic blocked result;
  owner preference, fixture classification, or private visibility must not make
  it public.
- Historical review submissions and evidence remain auditable while only the
  current valid review state can support release.
- Candidate, fixture, blocked, retired, expired, and unpublished records must
  remain absent from Foods, Today, Week, feeding eligibility, planner, and
  manual-meal-planning reads.
- Private-pilot browser coverage should exercise the populated parent-facing
  states, tester-only visibility, unavailable states, and recovery after a
  blocked or retired record.
- Release-readiness evidence must include populated accessibility checks and a
  representative performance profile; passing local CI alone is insufficient.
- Expansion tests should prove the stop conditions: unresolved P0/P1 defects,
  incomplete qualified evidence, missing accessibility/performance evidence,
  and absent go/no-go ownership each prevent expansion.

## Out of Scope

- Adding new food names or creating production catalog content beyond the
  existing PRD identity targets.
- Inventing, paraphrasing, or approving feeding, allergen, medical, storage,
  preparation, or visual-rights guidance.
- Reviewer recruitment, private reviewer identity storage, or a reviewer UI.
- External caregiver access, public beta, launch promotion, or a schedule-based
  release.
- Ticket 23C, Ticket 23D, or any later implementation slice already completed
  or separately planned; this document does not reopen them.
- New UI, auth, email, seed, schema, publication, or planner architecture
  beyond the seams needed by an approved implementation ticket.
- The eventual 40–60-food catalog expansion.

## Further Notes

Ticket 18 remains the authoritative external-release gate. The private pilot is
an evidence-gathering step and must not be described as public availability.
Any later implementation ticket must preserve the empty-production and
fail-closed guarantees until qualified content is actually imported and the
controlled publication boundary accepts it.
