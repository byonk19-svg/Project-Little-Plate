# ADR 0018: Candidate catalog review schema gates

- Status: accepted
- Date: 2026-08-03

## Context

Candidate catalog revisions need an auditable review boundary before a later
release operation can publish them. Qualified recommendations, evidence, and
owner adjudications must remain historical records; a mutable approval flag
would lose the provenance needed to explain a release decision.

## Decision

Ticket 23A stores review cases against the existing `content_revisions` chain.
Reviewer authority coverage, six review dimensions, immutable submissions and
evidence, and append-only owner adjudications are persisted in Supabase. A
service-role-only eligibility function derives the effective review per
dimension from explicit supersession links and returns stable reason codes.
Case transitions are controlled by a service-role function and never publish a
revision. Public catalog reads remain unchanged and candidate/fixture content
is not seeded.

Owner adjudication records a compatible choice or return/decline decision in an
append-only supersession chain. Only the chain tip is effective; adjudication
cannot replace qualified domain review or clear a domain block. Conditional
visual review uses the existing revision visual metadata, and storage reviews
must state whether reviewed support is present.

The `blocked` workflow state is entered only from `in_review` or
`changes_requested` when a current unsuperseded qualified `Block` exists. It
reopens only after every historical blocker has a same-dimension, same-lineage
qualified clearing submission (`Accept`, or non-blocking `Accept with
clarification` with resolved follow-up and no catalog change).

## Consequences

Multiple review rounds remain auditable, and later release work can consume a
deterministic gate without exposing candidate data. The schema and reason-code
contract are intentionally service-role operations only; reviewer UI,
publication integration, import expansion, and real catalog content remain
separate tickets.
