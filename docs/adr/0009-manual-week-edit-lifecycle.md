# ADR 0009: Manual Week edit lifecycle

- Status: Accepted
- Date: 2026-07-28
- Scope: Ticket 09 complete manual Week editing

## Context

Caregivers need to maintain a seven-day component plan without stale browser
state overwriting another edit or a failed action leaving part of a meal
changed. Locks, lifecycle status, swaps, and undo also need to remain
consistent with Today and serving while every newly attached preparation is
checked against current reviewed publication and feeding eligibility.

## Decision

- Keep one monotonically increasing version on each baby's meal plan. Every
  edit command locks the active baby and plan, requires the caller's expected
  version, and either commits one complete change plus the next version or
  commits nothing.
- Persist meal and component locks and a meal status of `planned`, `skipped`,
  or `completed`. Component-changing commands require a planned, unlocked
  target. A skipped or completed meal is omitted from Today and cannot consume
  a prepared portion.
- Revalidate each preparation added by a component swap, whole-meal swap,
  quick backup, copy, or undo while holding the same active-baby lock used by
  feeding-configuration changes. Resolve only the current active, approved,
  source-backed revision and current profile eligibility. A quick backup must
  also be present in the caregiver's configured quick-backup foods.
- Record every successful edit in an append-only `meal_edit_events` row with
  its plan version, exact payload, before and after meal state, result, actor,
  and idempotency key. Bind an idempotent retry to the same actor, plan,
  operation, and payload.
- Support one-step undo only for the latest successful swap. Undo is a new
  compensating event, is refused after intervening state changes, and
  revalidates every preparation restored from the earlier snapshot.
- Use a seven-local-date authenticated read model for current, prior, and
  future windows. Derive the displayed one-to-three slots from the active
  profile and keep the variety summary descriptive: distinct reviewed foods
  across planned meals, without grades or nutritional conclusions.
- Retain the Ticket 05 planning function as a compatibility wrapper around the
  versioned edit command so an older entry point cannot bypass lifecycle
  locks or eligibility checks.

## Consequences

- Concurrent edits with the same expected version serialize; one may succeed
  and the other receives a stale-plan result with the current version.
- Failed, stale, cross-household, unsupported, or ineligible edits do not
  increment the plan version or append an event.
- Serving and Week editing serialize on the active baby. A serving retry that
  already has a matching event still returns its original idempotent result
  even if the meal was subsequently completed.
- History describes what the caregiver did without rewriting safety content
  or previous outcomes. Production remains empty of food guidance; integration
  and browser proof use only synthetic reviewed fixtures.

## Reversal conditions

Revisit this decision before collaborative multi-user conflict resolution,
multi-step undo or redo, generated weekly planning, automatic variety goals,
or a more detailed meal lifecycle. Any replacement must preserve household
isolation, atomic edits, current eligibility revalidation, deterministic stale
handling, append-only audit evidence, and fail-closed Today and serving
behavior.
