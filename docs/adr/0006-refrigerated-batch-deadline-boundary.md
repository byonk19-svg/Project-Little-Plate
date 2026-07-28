# ADR 0006: Refrigerated batch deadline boundary

- Status: Accepted
- Date: 2026-07-28
- Scope: Ticket 06 preparation, refrigerator inventory, and deadline history

## Context

A caregiver must be able to turn a planned preparation into two refrigerated
portions without the application inventing a storage rule or moving a deadline
later on a future read. The reviewed-content boundary stores immutable storage
rules, but Ticket 06 also needs structured applicability, explicit precedence,
reviewed ranges, a starting event, and the exact rule application retained with
the resulting deadline.

## Decision

- Keep the existing immutable `storage_rules` records and attach append-only
  `storage_rule_profiles` imported only through the service role.
- Require each profile to identify its reviewed content revision, source,
  reviewer metadata, storage location, start-event kind, explicit precedence,
  and reviewed minimum and maximum duration.
- Apply the minimum duration when a reviewed range is present. A more specific
  approved rule may win only through explicit precedence; a missing, invalid, or
  ambiguous match is unsupported.
- Calculate elapsed hours from UTC instants and accept an explicit reference
  clock. Render the stored instants in the active baby's IANA time zone.
- Create the batch, its `prepared_or_opened` event, its cached portion count, and
  its deadline in one authenticated database transaction.
- Store the starting event, storage rule profile, rule identifier, content
  revision, applied duration, reviewed range, and exact instant on the deadline.
- Treat batch events and deadlines as append-only history. Direct caregiver
  writes remain unavailable; authenticated commands revalidate household
  ownership, current publication, and feeding eligibility.
- Treat the event ledger as authoritative. The cached remaining-portions
  projection is checked in the Kitchen read model and can be reconciled by an
  authenticated transactional command.
- Limit this slice to refrigerator batches. Freezer inventory, consumption,
  discard, thaw, and saliva-exposure transitions remain outside Ticket 06.

## Consequences

- Opening Kitchen or changing a meal cannot recalculate or extend an existing
  deadline.
- Historical deadlines remain explainable after reviewed content changes
  because their applied inputs and rule revision are retained.
- A preparation without a complete active reviewed storage profile cannot be
  saved through this flow.
- Production remains empty of safety guidance. Automated coverage imports only
  synthetic reviewed fixtures and retires their revisions after use.

## Reversal conditions

Revisit this boundary before adding freezer transfers, thaw deadlines,
saliva-exposure rules, rule-revision migrations, or automatic projection repair.
Any replacement must preserve fail-closed rule selection, immutable historical
provenance, UTC calculation, household isolation, transactional event creation,
and an authoritative event ledger.
