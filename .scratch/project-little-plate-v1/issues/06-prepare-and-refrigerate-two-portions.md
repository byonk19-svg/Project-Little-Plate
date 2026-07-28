# 06 - Prepare and refrigerate two portions

**What to build:** Let a caregiver turn a planned preparation into a two-portion refrigerated batch, see the reviewed rule before saving, and receive an exact explained deadline in Kitchen.

**Blocked by:** 05 - Plan one meal manually.

**Status:** ready-for-agent

- [x] Deadline selection and elapsed-hour calculation are pure, deterministic, and accept an explicit clock and rule revision.
- [x] A reviewed range uses the documented conservative endpoint unless a more specific approved rule applies.
- [x] Missing or ambiguous rule inputs produce a typed unsupported result and never a guessed deadline.
- [x] Batch creation accepts preparation, prepared/opened time defaulting to now, portion count, and refrigerator location.
- [x] The caregiver sees the governing reviewed rule and calculated deadline before confirming.
- [x] Confirming creates an append-only prepared/opened event, batch state, and deadline linked to its starting event and rule revision.
- [x] Kitchen shows the preparation, two remaining portions, local prepared time, exact discard deadline, and Ready/Use Today/Expired status.
- [x] Batch and event ownership are isolated to the correct household and baby.
- [x] The event ledger is authoritative; any cached portion projection is updated transactionally and can be reconciled.
- [x] Opening the app or editing a meal cannot move the deadline later.
- [x] Domain tests cover ranges, rule precedence, exact boundaries, UTC calculation, spring-forward, fall-back, and unsupported input.
- [x] Integration and browser coverage prove the planned-meal-to-Kitchen path.
- [x] Update this issue with verification evidence and the exact reviewed fixture used.

## Implementation decisions

- `CONTEXT.md` is absent from this repository. The issue, PRD, implementation
  plan, AGENTS.md, and accepted ADRs are the canonical context used for this
  slice.
- Existing reviewed `storage_rules` remain immutable. Ticket 06 adds a separate
  append-only structured profile containing applicability, precedence, reviewed
  duration range, source, reviewer, and review dates.
- A reviewed range applies its minimum duration. A more specific rule can win
  only through explicit precedence; absent or ambiguous matches return an
  unsupported result.
- Batch creation is a single authenticated transaction containing the batch,
  prepared/opened event, cached two-portion projection, and immutable deadline
  linked to its start event and exact reviewed rule revision.
- Events are the authoritative portion ledger. Kitchen exposes whether the
  cached projection matches the ledger, and the authenticated reconcile command
  repairs a mismatch without changing deadline history.
- Ticket 06 supports refrigerator creation only. It does not add freezer,
  thawing, consumption, discard, saliva-exposure, allergen, feeding, storage, or
  medical guidance.
- ADR 0006 records this durable boundary.

## Reviewed fixture status

Production seed data remains unchanged and contains no safety guidance. All
Ticket 06 proof uses synthetic test-only reviewed records:

- Integration fixture: `Ticket 06 Preparation`,
  `revision-ticket-06`, `rule-ticket-06`, and
  `rule-profile-ticket-06-v1`.
- Browser fixture: `ZZZ Batch Browser Preparation` with per-run UUID-suffixed
  identifiers so failed or repeated append-only runs cannot reuse retired
  content.
- Both fixtures use a synthetic reviewed 24-48 hour range, apply the
  conservative 24-hour endpoint, preserve a synthetic source URL and reviewer
  metadata, and label all guidance as synthetic.
- Browser revisions are retired after the run. Integration teardown retires its
  fixture after all assertions complete so a red run does not hide the original
  failure behind unavailable content.

## Acceptance evidence

- Pure domain coverage proves range handling, explicit precedence, exact
  boundary status, UTC elapsed-hour arithmetic, both daylight-saving
  transitions, and typed unsupported results.
- Real Supabase integration coverage proves preview and creation, append-only
  provenance, idempotency, fail-closed invalid data, household isolation, RLS,
  immutable deadlines, and ledger reconciliation.
- Mobile Chromium coverage proves the caregiver path from a planned Week meal
  through rule review and confirmation to two local-time Kitchen portions.

## Verification evidence

- `pnpm verify` — passed from a clean generated state: formatting, ESLint,
  strict typecheck, 23 unit/component tests, production build, database reset,
  31 real Supabase integration tests, nine mobile Chromium tests, and the
  whitespace check.
- `pnpm exec supabase db lint --local --level warning --fail-on error` —
  passed with no schema errors.
- `pnpm exec supabase db advisors --local --type security --level warn
  --fail-on error` — passed with no issues.
- `pnpm exec supabase db advisors --local --type performance --level warn
  --fail-on error` — passed with no issues.
- `pnpm exec supabase migration list --local` — all six local migrations,
  including `20260728073000`, match the rebuilt local database.
- `pnpm typecheck` after clearing the Playwright-generated dev cache — passed.
- `git diff --check` — passed.
- Two-axis code review against repository standards and the active
  issue/PRD/plan reached zero remaining actionable findings after trusted-clock,
  ledger-authority, relational-provenance, exact-time, and fixture-isolation
  corrections.

## Changed artifacts

- Domain and server boundary: `src/modules/storage/domain/deadline.ts`,
  `src/modules/storage/queries.ts`, `src/modules/storage/actions.ts`, and
  `src/modules/storage/form-state.ts`.
- Caregiver UI: `src/app/week/page.tsx`, `src/app/kitchen/page.tsx`,
  `src/app/kitchen/batch-confirmation-form.tsx`, and `src/app/globals.css`.
- Database: `supabase/migrations/20260728073000_prepare_refrigerated_batch.sql`.
- Automated proof: `src/modules/storage/domain/deadline.test.ts`,
  `tests/integration/refrigerated-batch.test.ts`, and
  `tests/e2e/refrigerated-batch.spec.ts`.
- Shared real-database fixture cleanup:
  `tests/integration/feeding-eligibility.test.ts` and
  `tests/integration/reviewed-content-foundation.test.ts`.
- Documentation: `README.md`, ADR 0006, and this issue.

## Remaining risks

- Freezer, thaw, consumption, discard, and saliva-exposure lifecycle work is
  deliberately deferred to their active tickets.
- Production safety content remains externally blocked on qualified review and
  is not supplied by this implementation.
