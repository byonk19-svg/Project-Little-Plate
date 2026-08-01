# ADR 0015: Privacy-safe learning and recovery boundary

## Status

Accepted

## Context

Dogfooding needs enough evidence to show whether caregivers can reach a useful
next-meal answer and complete the core operations. Product analytics must not
become a second store for child profiles, reaction descriptions, allergy
details, medical content, or arbitrary notes. Network interruption, stale
screens, and duplicate retries must also leave safety-relevant inventory and
plans in a trustworthy state.

## Decision

Core workflow events are an append-only, household-owned stream with a fixed
relational schema. Event names, operation names, outcome values, state values,
duration buckets, reason codes, workflow names, friction codes, and severity
values are closed allowlists enforced by both the TypeScript serializer and the
database command. There is no JSON payload or free-text analytics column.
Events contain actor, household, and active-baby identifiers for authorization
and operational aggregation, but never copy profile or safety-content fields.

Each product command reuses its command idempotency key as its analytics event
key. The database uniqueness boundary is household, event name, and event key,
so an identical client retry cannot inflate an outcome. Today-open events use a
server-created key so React development remounts remain one opening. Telemetry
failure never weakens or rolls back the underlying product command.

A missing response or transport error is not treated as a rejected command
because the mutation may already have committed. No definitive outcome event is
written for that ambiguous response. Refreshing and retrying the idempotent
command records the authoritative accepted or rejected result.

Safety-relevant forms do not optimistically expose changed plan or inventory
state. Offline submissions are stopped before dispatch and direct the caregiver
to reconnect and refresh. Existing transactional commands reject stale
versions, revalidate current reviewed content and restrictions, and return
fixed recovery copy while preserving the last committed state.

Feedback is structured only: workflow, one approved friction code, and a
minor-or-blocking impact. The form explicitly rejects and does not provide a
place for clinical detail.

Inventory health is derived from the batch projection and append-only event
ledger. Its read model exposes only batch identifier, lifecycle state, counts,
match status, and latest event time. An authenticated reconciliation command
can rebuild a stale cached count from the ledger without editing history.

## Consequences

- Product-learning queries are intentionally less flexible than arbitrary
  analytics payloads; adding a field or value requires a reviewed migration.
- Duplicate retry measurement is accurate without using profile or clinical
  data as a deduplication key.
- Interrupted commands are recovered by refreshing and retrying the same
  idempotent operation, not by manual database repair.
- Operational inventory diagnosis does not require inspecting food names,
  child data, reaction text, or caregiver notes.
- Product events are operational telemetry, not a safety audit record. Safety
  provenance remains in the existing reviewed-content, plan, and batch-event
  boundaries.
