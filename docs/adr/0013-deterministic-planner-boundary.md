# ADR 0013: Deterministic planner boundary

## Status

Accepted

## Context

The automatic planner must remain reproducible, explainable, and incapable of
trading safety for convenience. It also needs to preserve later locked choices,
use existing inventory accurately, and fail without producing a partial plan
that another layer could persist.

## Decision

The planner is a pure domain function over an explicit snapshot. The snapshot
contains the trusted clock and time zone, meal count and conservative
consumption boundaries, approved preparation revisions, skill compatibility,
restriction and exposure state, valid inventory, quick backups, caregiver
preferences, locks, reviewed new-portion strategies, and every referenced rule
revision. Missing or inconsistent snapshot data returns `invalid_snapshot`.

Boolean eligibility and storage feasibility are hard gates. Restricted,
reaction-blocked, incompatible, unpublished, expired, wrong-revision, or
deadline-infeasible inputs never enter soft scoring. Locked components reserve
scarce inventory through a polynomial whole-plan capacity-matching pass; every
otherwise preferred choice must leave at least one valid allocation for every
remaining slot. A preparation can appear at most once in a meal, matching the
persistence uniqueness boundary. Existing refrigerator/thawed units are
consumed earliest-deadline first. Frozen allocation requires reviewed freeze,
thaw, and post-thaw rule revisions. New refrigerator/freezer portions are
allowed only through an explicit reviewed strategy naming supported meals.

Soft priorities are deterministic and lexicographic. They consider usable
refrigerator inventory, frozen inventory, familiar pairing, exact repetition,
preparation reuse, food/method/texture variety, quick backups, new-food pace,
and preparation-time preference. Stable identities break final ties.
Explanations map selected reason codes to fixed non-safety copy; numeric scores
are not exposed.

The function returns either a complete plan with grouped preparation work,
reviewed thaw tasks, sorted rule revisions, and a canonical reproducibility
hash, or a typed actionable failure with no plan property.

## Consequences

- Identical semantic snapshots produce identical plans regardless of source row
  order.
- Ambiguous duplicate identities, malformed timestamps, incomplete meal-level
  locks, unreviewed rule references, and out-of-bound snapshots fail closed
  before planning.
- The planner bounds a snapshot to seven local days and uses capacity matching
  across meal slots, candidate-per-meal uniqueness, reviewed new-portion
  strategies, and individual inventory units. It does not perform an
  exponential candidate permutation search.
- Database snapshotting, transactional persistence, regeneration, and browser
  controls remain Ticket 14 responsibilities.
- Safety rule calculation stays in reviewed content/storage layers. The planner
  only consumes their explicit projections and never invents deadlines,
  transition support, or guidance.
- Soft ordering can be revised from beta evidence without changing the
  non-overridable hard-gate boundary.
