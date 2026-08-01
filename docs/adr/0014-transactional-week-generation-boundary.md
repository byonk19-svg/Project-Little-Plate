# ADR 0014: Transactional week generation boundary

## Status

Accepted

## Context

The pure planner can prove that one explicit snapshot has a complete feasible
answer, but its inputs can change before that answer is saved. Feeding
eligibility, reviewed content, inventory, locks, manual edits, and storage
deadlines must not be read or committed piecemeal. Regeneration must also retain
locked choices exactly and never expose a partial plan as committed.

## Decision

An authenticated snapshot RPC projects the current active baby's complete
planner input at one explicit reference time. It includes only current eligible
published preparation revisions and active reviewed refrigerator storage
profiles. Unsupported storage paths are omitted rather than inferred. The
server adapter validates that projection and calls the Ticket 13 pure planner.

The snapshot has a canonical input token. A separate transactional commit RPC
locks the active baby, rebuilds the snapshot at the same reference time, and
rejects a changed token or stale plan version before mutating the plan. It then
revalidates every output preparation revision, storage strategy, meal shape,
and locked choice against current database state. Only a complete matching
output can replace unlocked components.

The plan rows, version, rule revision IDs, reproducibility hash, explanations,
generation window/version, timestamp, and append-only generation event commit
in one transaction. The database derives applied rule IDs, reproducibility
metadata, reason codes, and fixed explanation copy from the validated snapshot
and selected components; caller-supplied provenance or copy is ignored. An
idempotency key plus submitted-plan fingerprint returns the original result
only for an identical retry.
Generation controls stay pending until the server action completes and display
only committed data after refresh. Infeasible and rejected results return fixed,
non-sensitive recovery copy and leave the prior plan untouched.

Planner metadata is associated with the exact persisted plan and meal window.
Historical windows do not render explanations or controls belonging to the
current generated plan.

## Consequences

- Concurrent generation and profile/edit operations serialize on the active
  baby boundary; a later stale request is rejected without partial writes.
- Meal and component locks survive regeneration exactly, while only unlocked
  components are replaced.
- Week persistence immediately feeds the existing Kitchen and grocery
  derivations because there is no secondary synchronization write.
- The production database still contains no safety-content fixtures. Tests
  import synthetic reviewed content and identify its fixture revisions and
  storage profiles explicitly.
- Frozen, thawing, new-freezer, or other storage strategies stay unavailable at
  this integration seam until complete reviewed transition inputs can be
  projected. The adapter does not manufacture eligibility or deadlines.
- The input token is a concurrency/reproducibility guard, not a security
  substitute. The commit RPC independently checks current authorization and
  hard constraints.
