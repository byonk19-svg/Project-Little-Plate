# ADR 0011: Reaction safety-block boundary

## Status

Accepted

## Context

A caregiver must be able to report a reaction after serving without asking the
application to interpret symptoms, diagnose an allergy, or generate medical
direction. The report must immediately remove the affected food from every
actionable planning and serving seam. Preference remains useful planning context
but cannot weaken a safety block. Reaction descriptions are sensitive household
data and must not leak into general analytics or operational logs.

## Decision

Reaction care direction uses the dedicated
`post-serve-reaction-care-direction` reviewed-content lineage with complete
source and review metadata. Approved revisions and retirements are append-only.
Publication, retirement, and report validation share one database serialization
boundary, so the report command accepts only the exact current revision. The
post-serve report surface is available only for a household-owned served event
and that current approved revision; otherwise it shows an unavailable state and
does not invent replacement copy.

Reports and resolutions are serialized database commands. A report revalidates
the served event and exact guidance revision, appends an actor-attributed event,
optionally updates preference in the separate exposure record, and changes the
food restriction to `reaction_reported` in one transaction. A resolution is a
different explicit command that appends a second event before restoring
`no_known_restriction`. Ordinary feeding-configuration edits continue to reject
attempts to clear `reaction_reported`.

Today, Week, manual meal commands, batch creation, serving, edit options, and
future deterministic-planner inputs all consume the existing centralized
eligibility boundary. They therefore observe the committed reaction block
immediately and cannot override it with preference, convenience, or scoring.
Future planned components remain visible but are marked
`replacement_required`.

Private descriptions are stored only on the household-owned append-only
reaction event. RPC responses, rejection messages, application logs, and
general analytics payloads never include that field.

Active reaction blocks have a household read model based on stable food
identity rather than current catalog publication. A reviewed food retirement
therefore cannot hide the separate audited resolution action.

## Consequences

- A report is tied to a real served event and cannot be submitted from a generic
  food page.
- Missing or retired reviewed care direction removes the reporting action rather
  than falling back to generated medical copy.
- Idempotency keys are payload-bound, and concurrent meal or serving commands
  serialize on the active baby before rechecking eligibility.
- Exact retries survive baby activation changes but still require current
  membership in the event's household.
- A reaction event validates its served-event baby and food, and batch identity
  becomes immutable after the first ledger event preserves that provenance.
- The current safety restriction remains a compact projection while reaction
  events preserve report and resolution history.
- Production reaction reporting remains unavailable until qualified reviewed
  guidance is imported; synthetic test guidance is retired during fixture
  cleanup.
