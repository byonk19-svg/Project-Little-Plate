# 10 - Complete the Kitchen lifecycle

**What to build:** Let a caregiver safely move portions through refrigerator, freezer, thawing, serving, return-untouched, discard, finish, and correction states while preserving an explainable history.

**Blocked by:** 06 - Prepare and refrigerate two portions; 08 - Surface use-soon and block expiration.

**Status:** complete

## Decisions

- Lifecycle commands are serialized and append-only; the cached batch quantity
  is a projection that can be checked against the event ledger.
- Freeze, thaw, and untouched return are exposed only from active reviewed
  transition records for the exact content revision and prior state.
- The Ticket 10 importer deliberately rejects reset-clock rules. The original
  refrigerator deadline therefore remains an upper bound; future reset
  semantics require a separately reviewed safety change.
- Freezer `quality_by` guidance is descriptive quality information, not a
  discard instruction. Ready serving requires an unexpired effective
  `discard_after` deadline.
- Corrections are compensating downward adjustments only. Quantity increases
  use the narrowly reviewed untouched-return transition.

## Fixture review

- Synthetic integration and browser transition records use `example.test`,
  explicit synthetic reviewer roles, exact reviewed ranges, thaw method,
  refreezing policy, and return policy.
- These fixtures are test-only and are retired/removed by their test cleanup.
  No production safety content was added.

## Unsupported transitions

- Freezing a partial, expired, unsupported, frozen, thawing, thawed, finished,
  or discarded batch.
- Serving a frozen, thawing, expired, finished, or discarded batch.
- Returning saliva-exposed or served-dish food, returning without the exact
  served event, returning twice, or returning without a reviewed rule.
- Extending a deadline, resetting the earlier refrigerator clock, refreezing,
  increasing inventory through correction, or editing/deleting historical
  events.

- [x] Every supported event records actor, UTC occurrence time, quantity effect, and required metadata.
- [x] Invalid prior-state transitions are rejected without appending a partial event.
- [x] Freezer inventory distinguishes quality-by guidance from discard-after deadlines.
- [x] Freeze is available only for untouched portions and when an approved transition rule permits it.
- [x] Begin-thaw and thawed actions require reviewed method, clock-start, post-thaw deadline, and refreezing policy.
- [x] Frozen time never resets an earlier refrigerator clock unless the approved rule explicitly defines that behavior.
- [x] A served-dish or saliva-exposed leftover cannot return to available inventory.
- [x] An untouched separately stored portion may return only through the explicit reviewed transition.
- [x] Discard and finish remove portions from availability without deleting history.
- [x] Correction appends a compensating event and never edits or removes the original event.
- [x] No sequence or concurrent command can make the projected remaining quantity negative.
- [x] A reconciliation check can prove the cached projection matches the authoritative event ledger.
- [x] Domain and integration tests cover legal transitions, illegal transitions, retries, concurrency, and reconciliation.
- [x] Browser coverage proves the applicable refrigerator/freezer lifecycle.
- [x] Update this issue with verification evidence and all unsupported transitions.

## Changed artifacts

- `supabase/migrations/20260728180832_complete_kitchen_lifecycle.sql` adds
  reviewed transition content, append-only lifecycle deadlines and events,
  serialized commands, household-scoped reconciliation, effective deadline
  selection, and lifecycle-aware Kitchen, Today, Use Soon, and serving reads.
- The storage domain module and unit tests define the pure legal-transition
  boundary. Strict transport, server actions, forms, and Kitchen UI render
  reviewed state, provenance, deadlines, quality guidance, and recovery only.
- Real Supabase tests cover both thaw clock starts, informational guidance,
  frozen expiry, retirement and command races, meaningful corrections,
  cross-household denial, idempotency, and ledger reconciliation.
- Mobile Chromium covers refrigerate, freeze, pre-action thaw guidance, thaw,
  serve, explicit untouched return, correction, finish, expiration cleanup,
  and narrow-viewport behavior.
- ADR 0010 records the durable lifecycle boundary; README describes the first
  ten slices.

## Acceptance and verification evidence

- The focused domain suite passes all 12 lifecycle cases, including expired
  begin-thaw and mark-thawed rejection. The strict transport suite passes both
  pre-clock thaw metadata and correction fail-closed cases.
- Clean replay plus the focused refrigerated-batch integration suite passes all
  16 real Supabase tests.
- The focused mobile Chromium suite passes both storage stories, including the
  complete reviewed recovery flow.
- After review fixes, `pnpm verify` passed formatting, ESLint, strict
  typechecking, 41 unit/component tests, production build, clean database
  replay, and 45 integration tests. Its Playwright web-server orchestration
  timed out before executing browser assertions; a clean immediate
  `pnpm test:e2e` rerun passed all 11 mobile Chromium tests. The remaining
  whitespace check is run directly before commit.
- Local migration replay includes all ten migrations through
  `20260728180832`; `supabase db lint --local --level warning` reports no
  schema errors, the local migration list is fully matched, and both the
  whitespace script and `git diff --check` pass.
- Final two-axis review reports zero remaining implementation, safety, or
  standards findings after the stale lifecycle test count was corrected.

## Remaining risks

- No Supabase cloud project is connected, so hosted security and performance
  advisors are externally unavailable. Local lint, RLS/integration proof, and
  clean migration replay are the available database gates.
- Production contains no transition guidance. Actions remain absent until
  qualified reviewed records with complete source metadata are imported.
