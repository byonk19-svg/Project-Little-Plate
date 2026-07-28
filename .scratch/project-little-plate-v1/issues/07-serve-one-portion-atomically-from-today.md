# 07 - Serve one portion atomically from Today

**What to build:** Show the planned ready portion on Today and let the caregiver serve it once while protecting inventory from retries, concurrent taps, stale state, and direct-service bypass.

**Blocked by:** 06 - Prepare and refrigerate two portions.

**Status:** ready-for-agent

- [x] Today places the current or next planned meal first and identifies ready, quick-preparation, or thaw-required state.
- [x] Today explains in plain language why the prepared component is available.
- [x] Serving validates caller household, baby, current preparation approval, current restriction state, batch lifecycle, deadline, and remaining portions inside one transaction.
- [x] Expiration uses trusted server/database time at command execution.
- [x] Serving appends an event and reduces two portions to one without rewriting prior history.
- [x] Repeating the same caller-stable idempotency key produces one successful serving outcome and one event.
- [x] Two concurrent attempts to consume the final portion produce exactly one success.
- [x] Unauthorized, cross-household, depleted, blocked, expired, or unpublished attempts leave inventory unchanged.
- [x] Expected failures return stable, non-sensitive reason codes and refreshable caregiver copy.
- [x] Today, Week, and Kitchen show a consistent result after serving.
- [x] The default served-as-planned path completes with one confirmation tap and does not require amount eaten.
- [x] Integration tests prove concurrency, idempotency, rollback, and direct bypass resistance.
- [x] Mobile browser coverage proves the complete first serve path.
- [x] Update this issue with verification evidence and concurrency results.

## Implementation decisions

- `CONTEXT.md` is absent from this repository. AGENTS.md, this issue, the PRD,
  implementation plan, and accepted ADRs supplied the canonical context.
- Today is an authenticated read model over the active baby's current or next
  planned meal. It exposes explicit component availability and never turns
  missing reviewed data into a recommendation.
- Serving is one security-definer database transaction. It serializes the
  caller-stable idempotency key, then locks the active baby, planned component,
  exact content revision, and owned batch in a consistent order. It revalidates
  current publication, current restriction and ability state, refrigerator
  lifecycle, post-wait trusted-time deadline, and ledger-derived remaining
  count.
- A successful command appends one immutable `served` event and updates the
  cached projection in the same transaction. The event retains its actor,
  planned component, idempotency key, trusted timestamp, decrement, and
  resulting portion count.
- Week derives `served` from the event ledger and Kitchen derives remaining
  portions from the same ledger. Today advances past fully served meals and
  Kitchen labels zero portions as finished. Revalidation refreshes Today, Week,
  and Kitchen after every expected outcome.
- `thaw_required` is a supported presentation state but is not produced because
  no reviewed freezer or thaw transition exists yet. Ticket 07 does not invent
  freezer, thaw, discard, saliva-exposure, allergen, feeding, storage, or
  medical guidance.
- ADR 0007 records the durable transaction and read-model boundary.

## Reviewed fixture status

Production seed data remains unchanged and contains no safety guidance. Ticket
07 extends Ticket 06's synthetic reviewed fixtures only:

- Integration uses `Ticket 06 Preparation`, `revision-ticket-06`,
  `rule-ticket-06`, and `rule-profile-ticket-06-v1`.
- Mobile Chromium uses the per-run UUID-suffixed
  `ZZZ Batch Browser Preparation` fixture.
- Both fixtures retain synthetic source, reviewer, review-date, eligibility,
  and conservative 24-hour refrigerator provenance.
- Fixture revisions are retired after successful proof. A failed run does not
  pre-retire the shared integration fixture and hide the original failure.

## Acceptance and concurrency evidence

- Before a batch exists, the Today read model reports
  `quick_preparation`; after two portions are created, it reports `ready` with
  the exact reviewed deadline, source, and explanation.
- The first serving command records one event and changes the ledger balance
  from two to one. Replaying the same idempotency key returns that original
  event and leaves the event count at one.
- Two simultaneous commands with different planned components and idempotency
  keys contend for the final portion. Exactly one returns `served`; the other
  returns `batch_depleted`. The ledger contains two total serving events and
  Kitchen reports zero remaining with a non-actionable `depleted` state.
- Two simultaneous commands for the same planned component but different
  batches produce one `served` result and one stable
  `component_already_served` result rather than surfacing a unique-index error.
- A held batch lock is released only after its reviewed deadline passes; the
  waiting request uses post-lock `clock_timestamp()` and returns
  `batch_expired` without an event.
- Held baby and revision transactions prove concurrent restriction and
  retirement commits are observed before serving continues.
- A synthetic test-only projection-update trigger raises after event insertion;
  the command rolls back both the event and projection, proving transaction
  atomicity.
- Integration proof also rejects anonymous access, cross-household access,
  direct event insertion, a current restriction, an expired batch, a depleted
  batch, an already-served component, and retired content without changing
  inventory.
- Mobile Chromium proves the caregiver path from Week preparation through
  Kitchen creation to Today availability, one-tap serving, one remaining
  Kitchen portion, and Week's served state.

## Verification evidence

- Focused real Supabase proof:
  `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/refrigerated-batch.test.ts`
  passed all 11 Ticket 06/07 tests after a clean local database reset.
- Focused mobile proof:
  `pnpm exec playwright test tests/e2e/refrigerated-batch.spec.ts --reporter=list`
  passed the complete one-test flow on mobile Chromium.
- `pnpm verify` passed: formatting, ESLint, strict typecheck, 23
  unit/component tests, production build, clean database reset, 37 real
  Supabase integration tests, nine mobile Chromium tests, and the whitespace
  check.
- `pnpm exec supabase db lint --local --level warning --fail-on error` passed
  with no schema errors.
- Both security and performance `supabase db advisors` checks passed with no
  issues.
- `pnpm exec supabase migration list --local` confirmed all seven migrations,
  including `20260728142349`, match the rebuilt local database.
- `git diff --check` passed.
- Two-axis review against the active issue/PRD/plan and repository standards
  reached zero remaining actionable findings after post-lock trusted-time,
  safety-state serialization, same-component concurrency, fully served Today
  advancement, rollback proof, and depleted Kitchen corrections.

## Changed artifacts

- Database:
  `supabase/migrations/20260728142349_serve_planned_portion_atomically.sql`.
- Today command/read boundary:
  `src/modules/meals/serving-actions.ts`,
  `src/modules/meals/serving-form-state.ts`, and
  `src/modules/meals/today-queries.ts`.
- Kitchen transport boundary: `src/modules/storage/queries.ts`.
- Caregiver surfaces: `src/app/today/page.tsx`,
  `src/app/today/serve-portion-form.tsx`, `src/app/week/page.tsx`,
  `src/app/kitchen/page.tsx`, and `src/app/globals.css`.
- Automated proof: `tests/integration/refrigerated-batch.test.ts` and
  `tests/e2e/refrigerated-batch.spec.ts`. The existing
  `tests/e2e/feeding-eligibility.spec.ts` now waits for the saved-state
  confirmation before navigating, removing a restriction-update race exposed
  by the full gate.
- Documentation: README, ADR 0007, and this issue.

## Remaining risks

- Freezer/thaw states, discard, saliva exposure, and the rest of the Kitchen
  lifecycle remain deliberately deferred to their active tickets.
- Production safety content remains externally blocked on qualified review and
  is not supplied by this implementation.
