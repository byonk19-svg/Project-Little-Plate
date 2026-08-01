# 15 - Add privacy-safe learning and recovery

**What to build:** Measure whether the core workflow is useful and make common stale, retry, and network failures recoverable without collecting sensitive child or reaction details.

**Blocked by:** 08 - Surface use-soon and block expiration; 10 - Complete the Kitchen lifecycle; 14 - Generate and regenerate a feasible week.

**Status:** complete

- [x] Emit only the approved core workflow events and non-sensitive failure reason codes.
- [x] Analytics payloads exclude exact birthdate, free-text notes, reaction descriptions, allergy details, and medical content.
- [x] Automated tests inspect representative analytics payloads rather than trusting event-call sites.
- [x] Today-open, meal-choice time, serving, batch outcome, swap, quick-backup, generation, and generation-failure events are sufficient to evaluate PRD dogfood questions.
- [x] Duplicate client retries do not produce misleading duplicate outcome events.
- [x] Stale tabs receive explicit refresh/retry behavior for serving, batch transitions, plan edits, and generation.
- [x] Optimistic UI is used only where failure can roll back without temporarily presenting unsafe inventory as available.
- [x] Poor-network and interrupted-command states recover without routine database repair.
- [x] Feedback capture records workflow friction without inviting sensitive clinical detail.
- [x] Operational views can identify stale batch records through privacy-safe state rather than free-text inspection.
- [x] Browser coverage exercises representative offline/poor-network, retry, stale-state, and rollback flows.
- [x] Update this issue with verification evidence and a documented analytics field inventory.

## Decisions

- `CONTEXT.md` is absent at the repository root. The canonical issue, PRD,
  project plan, accepted ADRs, and live Ticket 02-14 boundaries were used.
- Product learning uses a fixed-column append-only `product_events` table. No
  generic JSON or free-text payload is accepted.
- Analytics is best-effort and follows the product command. It cannot make a
  failed safety-relevant command look successful or weaken a transaction.
- Existing command idempotency keys are reused for outcome events. Today-open
  receives a server-created key so React development remounts deduplicate.
- A missing or transport-error mutation response is ambiguous, so it emits no
  definitive outcome. A later idempotent retry records the authoritative
  accepted or rejected result.
- Network loss blocks form dispatch before mutation. Caregivers receive an
  explicit reconnect, refresh-current-state, and retry instruction.
- Stale inventory projections are diagnosed only from batch identifiers,
  lifecycle state, cached and ledger counts, match status, and event time.
  Reconciliation uses the existing append-only ledger command.
- Durable rationale is recorded in ADR 0015.

## Analytics field inventory

All columns are scalar and allowlisted:

- Identity and ordering: `household_id`, `baby_id`, `actor_user_id`,
  `event_key`, `occurred_at`.
- Event: `event_name` is one of `today_opened`, `meal_choice_timed`,
  `serving_outcome`, `batch_outcome`, `swap_outcome`,
  `quick_backup_outcome`, `generation_outcome`, `generation_failed`, or
  `feedback_submitted`.
- Optional dimensions: `outcome`, `reason_code`, `operation`, `state`,
  `duration_bucket`, `workflow`, `friction_code`, and `severity`. The database
  validates the exact permitted field combination for each event.
- Duration is coarse (`under_10_seconds`, `10_to_30_seconds`, or
  `over_30_seconds`); no raw timing is stored.
- Feedback is limited to workflow, one fixed friction code, and
  `minor`/`blocking` severity.
- Explicitly absent: exact birthdate, nickname, food or preparation name,
  notes, reaction description, allergy detail, medical content, arbitrary URL,
  arbitrary error text, and JSON metadata.

## Acceptance evidence

- Unit payload tests inspect exact representative RPC objects and prove that
  the public event surface contains no sensitive or free-text field.
- Supabase integration tests prove allowed-field enforcement, household
  isolation, append-only behavior, direct-write denial, rejected arbitrary
  reason text, and retry deduplication.
- The refrigerated-batch integration suite proves stale cached counts are
  detected and reconciled from the append-only ledger without exposing
  sensitive fields.
- Mobile Chromium proves offline feedback is not sent, the UI rolls back to the
  unchanged form, reconnect/retry succeeds, and the stored Today-open and
  feedback payloads contain only the approved fields.
- Existing serving, batch, plan-edit, and generation browser/integration
  coverage continues to exercise stale rejection, retry, rollback, and
  committed-state refresh at the real Supabase seams.
- Mobile Chromium asserts stored event rows for serving, batch lifecycle,
  discard, component and whole-meal swaps, quick backup, generation success,
  and generation failure at the real product-action seams.
- The browser recovery suite holds a batch transition at the database lock,
  interrupts the client connection after the command reaches Supabase, and
  proves the committed state is recovered after reconnect. It also proves
  stale serving and batch transitions preserve the authoritative state.

## Fixture review

- The production migration adds no child, food, preparation, reaction, or
  safety-content fixture.
- Integration and browser identities are synthetic. Local reset-based test
  databases are disposable; append-only audit fixtures intentionally remain
  until the next reset rather than bypassing the production deletion guard.
- No reviewed-content fixture or safety rule was added or rewritten.

## Changed artifacts

- Privacy-safe event schema/RPC and inventory-health RPC migration.
- Typed event serializer, server actions, action instrumentation, Today timing,
  structured feedback, and offline form guard.
- Kitchen inventory-health read model and reconciliation UI.
- Unit, Supabase integration, and mobile Chromium recovery coverage.
- ADR 0015 and README decision index.

## Verification evidence

- `pnpm lint`, `pnpm typecheck`, and `pnpm build` - passed.
- Unit suite - passed, 111 tests.
- Clean-reset Supabase integration suite - passed, 55 tests.
- Mobile Chromium suite - passed, 13 tests. After the interrupted-transition
  synchronization was made deterministic, its affected refrigerated-batch
  suite passed again, 2 tests.
- `pnpm verify` was run through every gate. Formatting, lint, typecheck, unit,
  build, database reset, integration, and browser suites all passed in the
  aggregate runs; two aggregate attempts ended at local runner startup/timing
  failures that were isolated, fixed, and rerun green in the affected suite.
- `pnpm supabase db lint --local` - passed with no errors.
- Cloud Supabase advisors were unavailable because the connected Supabase
  account exposes no projects; local database lint and clean-reset integration
  coverage are the available database evidence.
- `node scripts/check-whitespace.mjs` and `git diff --check` - passed.
- Final two-axis issue and standards review - no findings.

## Remaining risks

- Product-event delivery is intentionally best-effort after a successful
  product command. An abruptly terminated request can omit telemetry, but a
  retry with the same command/event key safely fills the gap without duplicating
  the product mutation.
- Local Docker and Next.js startup occasionally stalled after database resets.
  The failures were runner infrastructure rather than product assertions; the
  required database, auth, REST, browser, and integration seams were rerun
  successfully after the exact local services were recovered.
