# 16 - Add deletion and operational controls

**What to build:** Give caregivers control over their account data and give operators safe ways to retire content, restore service, and promote database changes before external beta.

**Blocked by:** 02 - Create an authenticated baby profile; 03 - Browse one reviewed preparation; 10 - Complete the Kitchen lifecycle.

**Status:** complete

- [x] An authenticated caregiver can request deletion of their account and household-owned child, plan, inventory, and history data.
- [x] The deletion flow explains scope and any legally or operationally required retention before confirmation.
- [x] Deletion is idempotent and cannot target another household.
- [x] Partial deletion failure is recoverable and cannot leave the account appearing deleted while sensitive records remain normally accessible.
- [x] An authorized operator can immediately prevent a problematic content revision from new use.
- [x] Emergency retirement preserves historical rule and source provenance for prior deadlines and events.
- [x] Normal users cannot invoke content retirement or other privileged operational actions.
- [x] Local, staging, and production migration promotion behavior is documented and does not depend on untracked dashboard edits.
- [x] Backup and restoration procedures are documented and rehearsed against non-production data.
- [x] Incident handling identifies how to disable an affected recommendation/content path without bypassing unrelated safety checks.
- [x] Integration tests prove deletion authorization, retry, isolation, and content-retirement behavior.
- [x] Browser coverage proves caregiver deletion confirmation and completion behavior.
- [x] Update this issue with verification evidence, rehearsal results, and known retention limitations.

## Decisions

- `CONTEXT.md` is absent at the repository root. The issue, PRD, plan, accepted
  ADRs, and live Tickets 02, 03, 10, and 15 boundaries were used.
- Account deletion accepts no household identifier. It resolves the household
  from the authenticated caller and rejects the future shared-household case
  rather than deleting another caregiver's account.
- Household, profile, baby, plan, inventory, and household history rows plus
  the current auth identity are deleted in one database transaction.
- Append-only household histories allow deletes only during the trusted,
  transaction-local account cascade. Ordinary authenticated and service-role
  writes retain the existing append-only enforcement.
- The UI presents completion only after a definitive deleted response. A
  transport or malformed response is treated as ambiguous and directs refresh
  and retry without claiming that records remain or were removed.
- Emergency retirement uses the existing append-only content-retirement
  boundary. The approved revision, source, storage rule, and historical
  references are never edited or deleted.
- Operator actions require the service-role credential, incident reference,
  bounded reason, and deterministic/idempotent action key, and are recorded in
  an append-only operator stream.
- Automatic generation is checked before both snapshot creation and final
  commit. Disabling generation takes an exclusive control lock, so it waits
  for earlier commits to drain before returning. Manual planning stays
  available behind its existing safety checks.
- Emergency retirement takes an exclusive publication lock. Every
  current catalog/planner/Kitchen read and every content-attaching planner,
  preparation, batch-transition, and serving command takes the corresponding
  shared lock and revalidates reviewed content after waiting. Retirement
  therefore drains earlier reads and writes and blocks later new use without
  rewriting history.
- Durable rationale is recorded in ADR 0016.

## Acceptance evidence

- Supabase integration coverage deletes a synthetic household containing a baby
  profile, meal plan, batch, batch event, deadline, and product event, then
  proves the auth identity and exact rows are absent while another household is
  unchanged.
- A forced foreign-key failure after deletion begins rolls back the whole
  transaction. The account remains accessible and the same idempotent request
  succeeds after the blocking condition is removed.
- Direct invalid confirmation is rejected without mutation, and retry after
  successful deletion returns `already_deleted`.
- Concurrent emergency-retirement retries produce one retirement and the same
  result. A real batch-creation request held in flight completes before
  retirement returns; a later batch request is rejected. The revision
  disappears from new publication while its source and storage rule remain
  queryable.
- Authenticated caregivers receive permission denial for content retirement
  and operational controls. Service-role integration coverage disables
  generation while a real generated-week commit is held in flight, proves the
  control waits for that commit, proves later snapshots and commits fail
  closed, then restores the path.
- Mobile Chromium covers retention disclosure, exact confirmation, a rejected
  attempt that leaves the auth user intact, successful deletion, local
  sign-out, completion copy, and absence of household/profile/history rows.

## Rehearsal results

- `pnpm operations:rehearse-restore` refused non-local targets by design and
  restored the local application, auth, and migration schemas into isolated
  database `little_plate_restore_1785310042910`.
- Source and restored counts matched for households (32), babies (30), auth
  users (7), product events (39), migrations (15), RLS tables (37), and
  policies (23). The restored database retained the auth and household tables, critical
  deletion and retirement functions, caregiver access to deletion, and denial
  of caregiver access to retirement. The rehearsal then removed the isolated
  database and dump without replacing the active local database.
- Database promotion, backup/restore, and incident procedures are committed in
  `docs/operations/`; they require forward migrations and prohibit dashboard
  DDL.

## Fixture review

- All new content and caregiver fixtures are synthetic and test-only.
- The production migration adds two non-safety operational-control seed rows
  for automatic generation and content publication. It adds no baby, food,
  preparation, reaction, storage, feeding, or medical guidance.
- Emergency-retirement tests use reviewed synthetic content and do not rewrite
  its safety fields.

## Changed artifacts

- Atomic account-deletion command and narrowly scoped cascade exception.
- Service-role content-retirement and automatic-generation incident controls.
- Account deletion page, confirmation action, completion state, and Account
  navigation.
- Operator CLI, isolated local restore rehearsal, promotion/restore/incident
  runbooks, ADR 0016, and README index.
- Supabase integration and mobile Chromium acceptance coverage.

## Verification evidence

- Test-first red runs confirmed missing deletion/operator commands and Account
  UI before implementation.
- Clean `pnpm verify:database` - passed with all 15 migrations.
- Full `pnpm test:integration` from that clean baseline - passed, 59 tests.
- Focused mobile Chromium account-deletion flow - passed.
- `pnpm build`, `pnpm lint`, and `pnpm typecheck` - passed during development.
- Isolated local backup/restore rehearsal - passed with matching data,
  migration, RLS, policy, function, and privilege-boundary proof.
- Final `pnpm verify` - passed: formatting, lint, typecheck, 111 unit tests,
  production build, clean migration reset, 59 integration tests, 14 mobile
  Chromium tests, and whitespace validation.
- `pnpm exec supabase db lint --local` - passed with no schema findings.
- `git diff --check` - passed.
- Final issue/spec and engineering-standards reviews - zero actionable
  findings after all concurrency, missing-control, deletion-signal, Kitchen,
  and restore findings were resolved.

## Remaining risks and retention limitations

- V1 supports one caregiver profile per household. A household with multiple
  caregiver profiles is rejected without deletion and requires a future
  coordinated deletion design.
- The application retains no separate household copy after deletion. Protected
  provider backup snapshots may contain an encrypted copy until their
  configured automatic expiry and are used only for whole-service recovery,
  never selective account restoration.
- Exact provider backup schedule, expiry window, location, and restore
  authority are deployment facts not present in this local repository. The
  deployment owner must record and align them with the Account-page notice
  before the closed-beta gate can pass.
