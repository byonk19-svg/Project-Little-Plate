# ADR 0017: Catalog release pipeline boundary

- Status: Accepted
- Date: 2026-07-29
- Scope: Ticket 17 reviewed catalog expansion

## Context

The release catalog needs source monitoring, review-date enforcement, visual
rights and alt-text provenance, and target-size QA before a qualified content
package exists. Engineering must prove those controls with synthetic records
without treating them as production guidance.

## Decision

- Keep the production seed empty until authorized reviewers supply the
  version-controlled package and evidence described in the catalog release
  runbook.
- Reject a newly imported approved revision when its next-review date is
  already past. Preserve exact idempotent retries of revisions approved before
  that date; do not rewrite or unpublish historical records silently.
- Store immutable visual asset records separately from revision associations.
  Draft and in-review revisions may replace their association set; approval
  freezes the exact requirement and association set atomically. Require an
  asset reference, original/licensed rights basis, rights holder, meaningful
  alt text, and review date; licensed assets also require license name and URL.
- Require each catalog revision to declare whether a visual is required for
  release QA. A required visual must resolve to a complete visual record.
- Require an approved revision to carry a reviewed preparation-time band.
  Derive familiarity and skill compatibility only from the caller's recorded
  baby profile; expose unknown when no authenticated profile is available.
- Keep source checking an explicit release command scoped to sources referenced
  by current published candidates. Validate each redirect and pin requests to a
  vetted public address so the checker cannot reach local or private networks.
  Network availability does not mutate approved content automatically.
- Expose only current published content through the retirement publication
  barrier, with deterministic category, skill, allergen, and storage metadata
  for client-side filtering. Carry reviewed visuals, alt text, and rights
  attribution through the detail read model.
- Use conspicuously synthetic 40-to-60-item fixtures only for pipeline,
  responsiveness, and representative-shape tests. They never contribute to the
  launch-ready count recorded in the issue.

Existing approved revisions that predate this migration have neither an
explicit visual declaration nor a reviewed preparation-time band. They become
unavailable through the current-publication barrier and require a new reviewed
revision; the migration does not guess or backfill either value.

## Consequences

The database can report overdue revisions, missing visual declarations, and a
structural candidate count without inferring reviewer authority or declaring
beta readiness. Human approval roles, evidence mapping, and overdue-content
policy remain explicit release inputs. A broken source is reported and resolved
through a new reviewed record or retirement, never by silently changing an
approved source.

## Reversal conditions

Revisit this decision before adding a reviewer console, automated content
suspension, external asset hosting, or a policy that automatically unpublishes
overdue approved records. Any replacement must preserve approved revision,
visual, source, and historical deadline provenance.
