# Backup and restore

The deployment owner must record the provider, schedule, encryption, geographic
location, automatic-expiry window, restore-point objective, and people allowed
to restore each environment before external beta. The application promises no
separate household-data archive. Provider backup retention must match the
notice shown on the Account page.

## Non-production rehearsal

Run:

```powershell
pnpm operations:rehearse-restore
```

The script refuses non-loopback Supabase URLs. It writes a custom-format dump
of the application, auth, and migration-history schemas inside the local
database container, restores it into a uniquely named sibling database, proves
household, baby, auth-user, and product-event counts match, and verifies auth
and household tables, migration history, RLS/policy counts, critical deletion
and retirement functions, and their caregiver execute boundary. It then
removes that database and dump. Provider-managed schemas are restored by the
provider's whole-project procedure rather than this application rehearsal. The
script never replaces the active local database.

Record the date, source environment, backup identifier, restore result,
duration, migration count, and operator in the active release issue. Rehearse
after material schema changes and before each beta release.

## Real incident restore

1. Declare the incident and freeze writes at the application edge.
2. Identify the approved restore point and disclose the expected data-loss
   window.
3. Restore into an isolated non-production target first.
4. Validate migrations, RLS, auth, reviewed-content provenance, batch ledger
   reconciliation, and a representative browser flow.
5. Obtain the recorded incident approval before replacing production.
6. Re-enable traffic gradually and reconcile events created around the outage.

Backups are whole-service disaster recovery. They are not used to selectively
restore a deleted caregiver account.
