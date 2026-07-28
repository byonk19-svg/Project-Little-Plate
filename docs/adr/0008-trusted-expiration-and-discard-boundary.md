# ADR 0008: Trusted expiration and discard boundary

- Status: Accepted
- Date: 2026-07-28
- Scope: Ticket 08 use-soon, expiration, and remaining-portion discard

## Context

Caregivers need to see refrigerator portions before their reviewed discard
deadline and clean up portions after that deadline. A browser clock or stale
screen cannot decide whether a batch remains available. Discard also changes
the portion ledger and must retain history without allowing retries or direct
database writes to create conflicting lifecycle outcomes.

## Decision

- Build Kitchen and use-soon inventory from authenticated database read models
  that capture `statement_timestamp()` and accept no caller-provided clock.
- Classify a discard-after batch as expired when its exact deadline is less
  than or equal to trusted database time. Include only unexpired batches due
  within the next 24 elapsed hours in use-soon inventory.
- Order active inventory and use-soon results by exact deadline, then stable
  batch identity. Preserve the stored reviewed rule, source, review date,
  guidance, and applied duration on every result.
- Keep expired batches visible in a distinct, non-serveable Kitchen section.
  Exclude them from Today availability and use-soon results.
- Execute discard as an authenticated, security-definer transaction. Serialize
  the idempotency key, active baby, and owned batch; derive the current balance
  from the immutable ledger; append one `discarded` event for the full
  remaining balance; and update the cached projection atomically.
- A successful idempotent retry returns its original discard result. A
  different request after discard receives a stable already-discarded result.
  Discarded batches are hidden from current inventory while their batch and
  event history remain intact.
- Permit cleanup even when content has since been retired or the reviewed
  deadline has passed. Cleanup does not make a feeding recommendation and must
  not strand an unsafe batch because its original preparation is no longer
  publishable.
- Do not offer freezing. No active reviewed refrigerator-to-freezer transition
  or thaw rule exists in this slice, so the application cannot infer one.

## Consequences

- Reopening the application or changing the local clock cannot extend a stored
  deadline.
- A screen left open across the exact deadline may still show the old button,
  but the serving command revalidates with post-lock database time and fails
  without consuming a portion.
- Daylight-saving transitions affect only local display. The 24-hour window
  and exact deadline comparison use elapsed instants.
- Current inventory remains a projection over append-only history; cleanup
  never rewrites a prior preparation or serving event.
- Production remains empty of safety guidance. Automated proof uses only
  synthetic reviewed fixtures and retires their content revisions after use.

## Reversal conditions

Revisit this decision before implementing freezer transitions, thawing,
saliva-exposure disposal, partial discard, recovery from discard, or a general
batch lifecycle state machine. Any replacement must preserve trusted time,
exact-boundary expiration, reviewed provenance, household isolation,
append-only audit history, idempotency, and fail-closed serving.
