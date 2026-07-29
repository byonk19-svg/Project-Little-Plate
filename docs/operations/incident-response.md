# Incident response

Safety restrictions remain active during every incident. Do not bypass
eligibility, expiration, reviewed-content, storage, or household-isolation
checks to restore convenience.

## Problematic content revision

Set the service-role variables in the operator's protected shell, then run:

```powershell
node scripts/run-operator-action.mjs retire-content <revision-id> <incident-reference> "<reason>"
```

The command is idempotent, append-only, and service-role-only. Retirement
immediately removes the revision from new catalog, planning, batch-creation,
and serving eligibility while keeping its source, rule, historical deadlines,
and events. Verify the revision is absent from new selection and that an
existing historical deadline still names the original revision and source.

## Automatic-generation defect

Disable both snapshot creation and final commit:

```powershell
node scripts/run-operator-action.mjs set-generation disabled <incident-reference> "<reason>"
```

Manual planning remains available through its existing eligibility checks. An
in-flight generated week cannot commit after the control is disabled. Restore
only after the fix and regression evidence:

```powershell
node scripts/run-operator-action.mjs set-generation enabled <incident-reference> "<reason>"
```

Every action requires an incident reference and is recorded in the append-only
operator event stream. Never paste service-role keys into issue text, command
history shared with others, or application environment variables prefixed
`NEXT_PUBLIC_`.

## Minimum incident record

Record detection time, affected revision/path, reporter, user impact, control
action and idempotency key, verification evidence, restore decision, and
follow-up owner. If the safe scope is uncertain, disable automatic generation
and retire only the confirmed affected revisions; do not disable unrelated
safety enforcement.
