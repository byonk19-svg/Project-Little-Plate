# ADR 0010: Kitchen lifecycle boundary

## Status

Accepted

## Context

Prepared portions must move through refrigerator, freezer, thawing, serving,
return, finish, discard, and correction states without losing their safety
provenance or allowing a stale browser to create an invalid state. Freezer
quality guidance is not interchangeable with a discard deadline, and thaw
methods, clock starts, post-thaw deadlines, refreezing policy, and return policy
are safety-critical reviewed content.

## Decision

Kitchen lifecycle changes are serialized database commands. Each accepted
command appends an actor-attributed UTC event and then updates the batch
projection in the same transaction. Idempotency keys are bound to the exact
actor, batch, transition, and request payload. Corrections only reduce the
ledger quantity and reference the event they compensate; original events are
never edited or deleted.

Freeze, begin-thaw, and untouched-return commands resolve an active reviewed
transition record for the exact content revision and prior state. The UI
receives available actions and all safety copy from the database read model; it
does not infer actions, durations, methods, or policies. Missing reviewed data
therefore removes the action and direct RPC attempts fail closed.

The original refrigerator deadline is retained permanently. The effective
deadline is the conservative earlier discard deadline unless a future reviewed
rule explicitly permits resetting the prior clock. Ticket 10 transition imports
reject such reset rules, so this slice cannot silently extend refrigerator
time. Freezer `quality_by` is labeled as quality guidance and is never treated
as an automatic discard deadline.

Only `refrigerated` and fully `thawed` batches with an unexpired effective
`discard_after` deadline may be served or appear ready in Today. Frozen and
thawing batches appear as `thaw_required`. A served portion may return only when
the exact served event is supplied, the exposure is explicitly
`untouched_separately_stored`, and a reviewed return rule exists. Saliva-exposed
or served-dish leftovers are not returnable.

## Consequences

- Event-ledger reconciliation can prove that the cached portion count matches
  append-only history.
- Concurrent commands serialize at the baby and batch boundaries and cannot
  drive quantity below zero.
- Historical deadlines preserve the rule version, reviewed range, applied
  conservative duration, source, and start event used at the time.
- Transition kinds or reset-clock behavior not represented by reviewed records
  remain unsupported rather than being guessed.
