# 08 - Surface use-soon and block expiration

**What to build:** Make approaching and crossed deadlines visible and actionable, while ensuring a batch can never be served once its exact deadline has passed.

**Blocked by:** 07 - Serve one portion atomically from Today.

**Status:** complete

- [x] Today shows refrigerated batches due within the next 24 elapsed hours ordered by exact deadline.
- [x] Kitchen defaults refrigerator inventory to earliest deadline first.
- [x] A batch at its exact discard instant is expired and excluded from available inventory.
- [x] Expired batches move to a distinct section and are not selectable for meals or serving.
- [x] A screen left open across the deadline is revalidated at command time and receives a clear expired/stale result.
- [x] The caregiver can use the item in the next meal, inspect the rule explanation, or discard it when applicable.
- [x] Freezing is offered only for untouched portions with a reviewed transition rule; this ticket does not invent thaw policy.
- [x] Reopening the application, changing a meal, or changing the local clock cannot extend the deadline.
- [x] Use-soon calculation and local copy remain correct across daylight-saving transitions.
- [x] Domain tests cover immediately before, exactly at, and immediately after expiration.
- [x] Integration tests prove expired batches are blocked through direct commands.
- [x] Browser coverage proves use-soon display, deadline crossing, and expired cleanup.
- [x] Update this issue with verification evidence and boundary timestamps.

## Implementation decisions

- `CONTEXT.md` is absent from this repository. AGENTS.md, this issue, the PRD,
  implementation plan, and accepted ADRs supplied the canonical context.
- Kitchen and use-soon are authenticated database read models that capture
  `statement_timestamp()` and accept no caller time. The former
  caller-supplied-time Kitchen function is dropped rather than left as a
  callable overload.
- The exact discard instant is expired (`deadline_at <= trusted_now`). Use-soon
  contains only positive-balance, unexpired refrigerator batches due within
  the next 24 elapsed hours and orders them by exact deadline and stable batch
  identity. Today receives at most the first three and links to complete
  refrigerator inventory in Kitchen.
- Today and Kitchen render the stored reviewed deadline, guidance, source, and
  review date. Today offers “Use in next meal” only when the same batch is
  selected for a component in the actual Today read model; it does not serve a
  later scheduled component or generate a meal recommendation.
- A failed use-soon read renders a calm unavailable state and a Kitchen
  recovery link rather than looking like an empty refrigerator.
- Discard is one security-definer transaction over an owned batch. It
  serializes the idempotency key, active baby, and batch, derives the current
  balance from immutable events, appends one `discarded` event for the entire
  remaining balance, and updates the cached projection atomically.
- Expired batches remain visible in a distinct, non-serveable Kitchen section
  until discarded. Discarded batches leave current inventory but retain their
  batch and append-only event history.
- Cleanup remains available after expiration or content retirement because it
  does not recommend or serve the preparation. No freeze affordance is
  rendered because no active reviewed transition or thaw rule exists.
- ADR 0008 records the trusted expiration and discard boundary.

## Reviewed fixture status

Production seed data remains unchanged and contains no safety guidance. Ticket
08 extends Ticket 06/07's synthetic reviewed fixtures only:

- Integration uses `Ticket 06 Preparation`, `revision-ticket-06`,
  `rule-ticket-06`, and `rule-profile-ticket-06-v1`.
- Mobile Chromium uses the per-run UUID-suffixed
  `ZZZ Batch Browser Preparation` fixture.
- Both fixtures retain synthetic source, reviewer, review-date, eligibility,
  conservative 24-hour refrigerator provenance, and reviewed guidance.
- Fixture revisions are retired after successful proof. A clean database reset
  was run before focused integration proof so a prior failed run could not hide
  the active fixture.

## Acceptance and boundary evidence

- Fixed domain boundary: for deadline `2026-07-29T12:00:00.000Z`,
  `11:59:59.999Z` remains available, while the exact deadline and
  `12:00:00.001Z` are expired.
- Daylight-saving cases start at `2026-03-08T06:30:00.000Z` and
  `2026-11-01T05:30:00.000Z`; both retain exactly 24 elapsed hours while local
  display follows `America/Chicago`. The shared production formatter is tested
  with `12:30 AM` to `1:30 AM` spring copy and `12:30 AM` to `11:30 PM` fall
  copy.
- Real Supabase proof creates 2-hour and 4-hour use-soon batches plus an
  already-expired batch. Use-soon returns eligible unexpired rows in exact
  deadline order with reviewed provenance and caps the Today payload at three;
  Kitchen returns all current rows in deadline order and classifies the crossed
  row as expired.
- Integration explicitly proves the one use-soon action is bound to the batch
  and component selected by `get_today_meal`; other returned batches have no
  serve action.
- Direct serving of the expired batch returns `batch_expired` without an event.
  Discard appends one event with delta `-2` and resulting balance `0`; the same
  idempotency key returns the original result, a different key receives
  `batch_already_discarded`, and current inventory then hides the batch.
- Two simultaneous different-key discards produce exactly one event, one
  success, and one stable already-discarded result. Anonymous reads,
  caller-controlled inventory time, direct event insertion, and authenticated
  cross-household discard remain unavailable.
- Mobile Chromium creates a normal and a batch due 20 seconds after creation,
  verifies earliest-deadline ordering and reviewed explanation in Kitchen and
  Today, leaves Today open across the deadline, and receives
  “The reviewed deadline has passed” when serving. Refresh selects the still
  valid batch; Kitchen moves the crossed batch to Expired, and discard removes
  it from current inventory with a visible confirmation.
- The same browser flow proves no Freeze action appears without a reviewed
  transition rule.

## Verification evidence

- Focused real Supabase proof:
  `pnpm test:integration -- tests/integration/refrigerated-batch.test.ts`
  passed all 38 integration tests, including all 12 refrigerated-batch tests.
- Focused mobile proof:
  `pnpm exec playwright test tests/e2e/refrigerated-batch.spec.ts --grep "a use-soon batch"`
  passed the deadline-crossing and cleanup story on mobile Chromium.
- `pnpm verify` passed: formatting, ESLint, strict typecheck, 26
  unit/component tests, production build, clean database reset, 38 real
  Supabase integration tests, ten mobile Chromium tests, and the whitespace
  check.
- After strengthening the actual-Today binding assertion,
  `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/refrigerated-batch.test.ts`
  passed all 12 focused tests again.
- `pnpm exec supabase db lint --local --level warning --fail-on error` passed
  with no schema errors. Security and performance `supabase db advisors`
  checks both returned no issues.
- `pnpm exec supabase migration list --local` confirmed all eight migrations,
  including `20260728153447`, match the rebuilt local database.
- `git diff --check` passed.
- Two-axis review against the active issue/PRD/plan and repository standards
  resolved actual-next-meal binding, max-three task scope, explicit read
  failure, lifecycle parser consistency, DST display proof, discard
  authorization/concurrency coverage, and issue-evidence findings. The final
  re-review reached zero remaining actionable findings.

## Changed artifacts

- Database:
  `supabase/migrations/20260728153447_surface_use_soon_and_block_expiration.sql`.
- Storage transport/commands:
  `src/modules/storage/queries.ts`,
  `src/modules/storage/discard-actions.ts`,
  `src/modules/storage/discard-form-state.ts`, and
  `src/components/storage/discard-batch-form.tsx`.
- Caregiver surfaces: `src/app/today/page.tsx`,
  `src/app/today/serve-portion-form.tsx`, `src/app/kitchen/page.tsx`, and
  `src/app/globals.css`.
- Automated proof: `src/modules/storage/domain/deadline.test.ts`,
  `src/modules/storage/presentation.ts`,
  `src/modules/storage/presentation.test.ts`,
  `tests/integration/refrigerated-batch.test.ts`, and
  `tests/e2e/refrigerated-batch.spec.ts`.
- Documentation: README, ADR 0008, and this issue.

## Remaining risks

- Production safety content remains externally blocked on qualified review and
  is not supplied by this implementation.
- Freezer, thaw, saliva-exposure, partial-discard, and discard-reversal
  lifecycles remain deliberately unsupported until an active issue and
  reviewed policy define them.
