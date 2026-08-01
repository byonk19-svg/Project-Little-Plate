# ADR 0004: Feeding eligibility boundary

- Status: Accepted
- Date: 2026-07-27
- Scope: Ticket 04 feeding eligibility configuration and enforcement

## Context

Project Little Plate needs caregiver-entered observations and food context before
an approved preparation may be selected. Birthday, preference, exposure, and
planning convenience must never become substitutes for a reviewed preparation's
ability requirements or for an explicit food safety status.

The production catalog still contains no qualified reviewed fixture. Eligibility
therefore has to work from the reviewed publication boundary established by ADR
0003 and remain unavailable when that boundary supplies no supported options.

## Decision

- Store ability observations, food restrictions, exposure/preference state,
  planning preferences, and quick backups as separate household-owned records.
- Populate setup choices only from foods and skill tags used by currently active,
  approved, unretired preparations that satisfy the publication contract.
- Limit the exposure quick-select surface to 15 reviewed foods and quick backups
  to eight foods.
- Preserve recorded exposure rows that move outside the current 15-food
  quick-select as catalog ordering changes. An unrelated setup edit must not
  erase that history.
- Represent ability as `observed`, `not_observed`, or `not_sure`. Missing,
  not-observed, and not-sure states do not satisfy a required ability.
- Require an explicit `no_known_restriction` state before a food can be eligible.
  Confirmed allergy, directed exclusion, temporary avoidance, and
  reaction-reported states always block selection.
- Keep exposure/preference state independent from safety state. Liked, neutral,
  disliked, not-tried, skipped, and unknown exposure values do not alter
  eligibility.
- Preserve reaction-reported state during ordinary configuration edits. Clearing
  that block requires a later explicit resolution command rather than a
  preference edit.
- Save the complete caregiver configuration through one authenticated,
  transactional database command. Grant household clients read-only table access
  through RLS and no direct table-write access.
- Expose eligibility through an authenticated, fail-closed database function
  that rechecks current publication, restriction, and ability state on every
  call.
- Use explicit convenience choices for V1 planning input: zero through three new
  foods per week, under 15 minutes, under 30 minutes, or flexible preparation
  time, and an optional day of week. These choices are preferences, not safety
  guidance.

## Consequences

- A newly published ability requirement remains unsatisfied until the caregiver
  records it as observed.
- Missing restriction setup blocks selection instead of being treated as "no
  known restriction."
- Preference and exposure edits cannot re-enable a safety-blocked food.
- Retired or unpublished preparations and identifiers outside the reviewed setup
  options cannot be configured or reported as eligible through application RPCs.
- Catalog growth may change which foods appear in exposure quick-select without
  silently deleting previously recorded exposure state.
- Ticket 05 can call the same database eligibility boundary before attaching a
  preparation instead of trusting prior UI state.
- A clean production reset still exposes no feeding options because the seed
  contains no qualified reviewed content.

## Reversal conditions

Revisit this decision before adding reaction resolution, reviewer-managed ability
vocabulary, multiple active babies in the interface, or a planner snapshot
format. Any replacement must preserve explicit observations, restriction
precedence, preference/safety separation, current approved-content validation,
household isolation, and fail-closed direct-service behavior.
