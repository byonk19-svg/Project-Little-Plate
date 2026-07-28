# ADR 0012: Derived work and grocery boundary

## Status

Accepted

## Context

A committed manual week must produce one useful Kitchen work plan and grocery
list without copying derived rows into a second mutable plan. Preparation work
must account for valid inventory and stay synchronized with every accepted plan,
eligibility, restriction, and inventory change. Caregiver-owned reminder and
grocery choices must survive recomputation without becoming safety inputs.

## Decision

Preparation tasks and plan-derived grocery items are authenticated read models,
computed from the current seven-local-day committed plan at database statement
time. Only planned, unserved components tied to the exact current reviewed
revision and current eligibility are candidates. Ledger-backed portions must
match that revision. Refrigerator and thaw lifecycle portions are allocated
only when the reviewed effective deadline remains valid through the
conservative end of the meal's local date. Frozen portions require an append-only reviewed
freeze transition and remain bounded by Ticket 10's preserved original discard
deadline; an informational quality date cannot replace or extend it.

Uncovered components are grouped by reviewed preparation and retain exact meal
component traces. Quantities are integer portions. Grocery needs then merge by
reviewed food identity and use the food's structured category as the store
section. A configured quick backup subtracts need only when the caregiver also
marks it already available. Caregiver-marked already-have rows leave the active
grocery list but remain undoable. No weight, nutrition, preparation
eligibility, storage, allergen, or medical value is inferred.

Derived rows are never persisted as an independently editable plan. The
persistence layer stores only:

- a reminder dismissal for one exact task fingerprint, including its plan,
  uncovered component, inventory, and durable semantic restriction version;
- independent caregiver already-have and checked operations keyed by stable
  food identity;
- soft-deleted manual grocery items in a separate household-owned table; and
- append-only, actor-attributed, payload-bound idempotency events for mutations.

Starting a preparation task uses one traced uncovered meal component to open
the existing reviewed batch-preview flow with the preparation already selected.
Dismissal hides only the current reminder instance and never edits its meal.

## Consequences

- Accepted plan edits, serving, inventory transitions, content publication,
  restrictions, and eligibility changes are reflected on the next read without
  synchronization jobs or partial derived writes.
- Rejected plan edits cannot change derived output because there is no derived
  snapshot to update.
- A new plan version or materially changed inventory/restriction input makes an
  old reminder dismissal inapplicable; manual items and stable food-level
  grocery choices remain.
- The first slice groups by reviewed preparation. More detailed cross-food
  action grouping remains deferred until reviewed structured action metadata
  exists; the application does not derive action labels from free text.
