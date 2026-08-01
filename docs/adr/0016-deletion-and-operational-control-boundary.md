# ADR 0016: Deletion and operational control boundary

## Status

Accepted

## Context

External beta requires a caregiver-controlled deletion path and a narrow
operator path for unsafe content or automatic-generation incidents. Household
history is normally append-only for safety auditability, but an account
deletion must remove that household history without weakening the append-only
boundary for ordinary callers.

## Decision

Account deletion is one authenticated, transactionally atomic database command.
It accepts no household identifier and resolves ownership from the caller. The
V1 command refuses a household with multiple caregiver profiles rather than
deleting another person's account. A trusted transaction-local deletion context
allows only cascade deletes initiated by the security-definer command to pass
the household-history append-only triggers. Direct authenticated and
service-role mutations remain blocked by those triggers.

The command deletes the household cascade and current auth identity in the same
transaction. Any constraint or downstream failure rolls back both. A confirmed
response causes the application to clear its local session and show completion;
an ambiguous transport response never presents deletion as complete.

Emergency content retirement and automatic-generation controls are
service-role-only RPCs with validated incident references, bounded reasons,
idempotency keys, and append-only operator events. Content retirement inserts
the existing publication retirement record rather than editing or deleting the
reviewed revision. Automatic generation is checked before both snapshot
creation and final commit; manual planning retains all existing safety checks.

Schema promotion uses committed forward migrations. Backup restoration is
rehearsed only against a separate local database and is reserved for
whole-service disaster recovery, never selective recovery of a deleted account.

## Consequences

- Household audit history is preserved during normal product use and removed
  only as part of the caller-owned account transaction.
- Shared-household deletion needs a future coordinated workflow before the
  product supports multiple caregiver accounts.
- Provider backup expiry is an operational deployment fact that must be
  recorded and aligned with the in-product retention notice before beta.
- Operators need protected service-role credentials; caregivers and normal
  authenticated clients cannot invoke incident controls.
