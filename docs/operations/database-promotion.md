# Database promotion

Committed migrations are the only schema-change source. Dashboard DDL, edited
applied migrations, and production-first SQL are prohibited.

## Promotion order

1. From a clean checkout, run `pnpm supabase:reset`, `pnpm verify`, and
   `pnpm supabase db lint --local`.
2. Link the Supabase CLI to the staging project using its documented project
   reference and operator-controlled credentials.
3. Review `pnpm exec supabase db push --dry-run`. Stop if the output contains
   anything except the committed forward migrations intended for the release.
4. Capture a staging backup using the provider-approved backup procedure, then
   run `pnpm exec supabase db push`.
5. Run the RLS, integration, browser, and content-publication smoke suites
   against staging. Record the migration versions and evidence in the release
   issue.
6. Repeat the dry run, backup, push, and smoke sequence for production only
   after staging evidence is accepted.

Environment project references and secrets are deployment configuration, not
repository data. Never store service-role keys in Git or copy staging data into
local fixtures. A failed forward migration is repaired with a new forward
migration; applied files are never rewritten.

## Rollback

Application rollback does not reverse schema history. Disable the affected
path, preserve evidence, and ship a reviewed forward repair. Restore the whole
database only for a declared disaster-recovery incident and only from a backup
whose retention and restore point are known.
