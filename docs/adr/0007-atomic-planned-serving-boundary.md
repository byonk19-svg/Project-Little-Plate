# ADR 0007: Atomic planned serving boundary

- Status: Accepted
- Date: 2026-07-28
- Scope: Ticket 07 Today read model and planned-portion serving

## Context

Today must show the current or next planned meal and let a caregiver serve one
valid prepared portion without allowing retries, concurrent taps, stale UI, or
direct database writes to consume more inventory than exists. The serving
decision depends on mutable household, content, eligibility, batch, deadline,
and ledger state, so a client-side decrement cannot preserve the safety or audit
boundaries established by Tickets 02 through 06.

## Decision

- Build Today from an authenticated database read model that selects the
  current or next planned meal in the active baby's IANA time zone.
- Report an explicit availability state for every planned component. Ticket 07
  produces `ready`, `quick_preparation`, `served`, or `unavailable`.
  `thaw_required` is reserved for a future reviewed freezer lifecycle and is not
  inferred in this slice.
- Offer serving only for an unexpired refrigerator batch with a positive
  ledger-derived portion count and complete reviewed storage provenance.
- Execute serving as one security-definer transaction. Lock the owned batch,
  but first serialize the active baby, planned component, and exact content
  revision in the established order. Revalidate household ownership, active
  baby, current content publication, feeding eligibility, storage lifecycle,
  deadline, and ledger balance before appending an event.
- Capture trusted database wall-clock time only after serialization waits
  complete, then use that exact instant for both the deadline comparison and
  event timestamp.
- Append one immutable `served` event with a caller-stable idempotency key,
  planned component, resulting ledger balance, actor, and trusted timestamp.
  Update the cached batch projection in the same transaction.
- Serialize a repeated idempotency key and make successful retries return the
  original event result. A planned component may be served at most once.
- Keep direct caregiver writes to batches and events unavailable. Expected
  command failures return stable, non-sensitive reason codes and leave history
  and inventory unchanged.
- Skip fully served meals when selecting the next Today meal. Derive Week's
  served state and Kitchen's remaining count from the same event history, and
  label a zero-portion Kitchen batch as finished rather than ready.

## Consequences

- Two concurrent attempts for the final portion can produce only one appended
  serving event and one success.
- Two batches cannot serve the same planned component twice; component
  serialization turns the losing request into a stable already-served result.
- A request that waits on a lock until after its reviewed deadline is rejected
  using post-wait database time.
- Replaying a successful request does not append another event or decrement the
  batch again.
- A stale page cannot bypass a new restriction, retired preparation, passed
  deadline, depleted batch, or household boundary.
- Serving records that the planned portion was served; it does not collect,
  infer, or score the amount eaten.
- Production remains empty of safety guidance. Automated proof uses only
  synthetic reviewed fixtures and retires their content revisions after use.

## Reversal conditions

Revisit this boundary before supporting serving outside a planned component,
partial portions, freezer or thaw transitions, discard, saliva exposure, or a
different event-store projection model. Any replacement must preserve trusted
time, current safety revalidation, household isolation, immutable history,
idempotency, final-portion concurrency safety, and fail-closed availability.
