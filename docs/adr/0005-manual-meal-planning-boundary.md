# ADR 0005: Manual meal planning boundary

- Status: Accepted
- Date: 2026-07-27
- Scope: Ticket 05 one-meal manual planning

## Context

Project Little Plate needs its first persistent meal plan before batch inventory
or automatic planning begins. A caregiver must be able to attach an eligible
reviewed preparation to tomorrow in the baby profile's local calendar without
allowing a stale browser or direct RPC call to bypass publication, restriction,
reaction, or observed-ability requirements.

The production catalog still contains no qualified reviewed fixture. Manual
planning must therefore remain safely empty after a clean reset while test-only
fixtures prove the real publication, eligibility, database, and browser seams.

## Decision

- Store one manual plan per active baby, dated meal slots within that plan, and
  one to three distinct preparation components per meal.
- Store both the stable preparation identifier and the exact approved content
  revision identifier on every component. Enforce that the revision belongs to
  that preparation so later commands can revalidate current and historical
  identity separately.
- Expose household-owned planning tables as RLS-protected read models only.
  Keep writes behind a narrowly granted authenticated database command.
- Add a preparation to tomorrow through one transaction that validates the
  caller's active baby, configured meal slot, current Ticket 04 eligibility,
  current Ticket 03 publication, and the three-component limit before changing
  the plan.
- Serialize edits to the same baby, local date, and meal slot. Treat a repeated
  request for the same preparation as an idempotent success.
- Interpret today and tomorrow by converting the database instant into the
  baby profile's recorded IANA time zone before taking the calendar date.
- Present Week as a rolling seven-local-date read model. Return every configured
  slot even when it has no components, and fail closed if profile or time-zone
  state cannot be loaded.
- Keep automatic generation, locks, swaps, copy, delete, skip, completion, undo,
  Kitchen derivation, and grocery derivation outside Ticket 05.

## Consequences

- UI eligibility is an affordance, not an authorization boundary. Direct calls
  receive the same stable rejection reasons and leave prior plan state
  unchanged.
- A later content revision does not rewrite the revision identity saved on an
  existing component.
- A newly blocked or retired preparation can be detected by revalidating the
  saved identifiers in later Today and week-editing tickets.
- Calendar dates remain stable across spring-forward and fall-back transitions
  because planning uses local calendar conversion rather than elapsed hours or
  the server's configured time zone.
- The current Week view contains no automatic suggestions and a production
  reset remains empty until qualified reviewed content is supplied.

## Reversal conditions

Revisit this boundary before introducing multiple plan versions, automatic
generation, multiple active babies, caregiver collaboration, or historical
plan-edit events. Any replacement must preserve household isolation, command
atomicity, current eligibility revalidation, exact approved revision identity,
the three-component invariant, and explicit IANA calendar semantics.
