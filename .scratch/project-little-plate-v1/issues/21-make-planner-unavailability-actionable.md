# 21 - Make planner unavailability actionable

**What to build:** Replace the impossible automatic-generation action with a
clear recovery state when Week has no eligible reviewed preparation options.

**Blocked by:** 14 - Generate and regenerate a feasible week.

**Status:** complete

- [x] Week does not render an enabled generation action when the verified
  option set contains no eligible reviewed preparations.
- [x] The unavailable state explains that no eligible reviewed preparation is
  currently available without guessing why.
- [x] The state links to Foods and Feeding setup as the safe recovery surfaces.
- [x] No plan is generated, partially saved, or changed from this state.
- [x] Existing Week dates, slots, locks, status, and committed components
  remain visible.
- [x] Transport, authentication, and snapshot failures retain distinct
  fail-safe handling.
- [x] Eligible synthetic fixtures continue to expose and complete generation.
- [x] Mobile-browser coverage proves both the empty-catalog state and the
  eligible generation regression path.
- [x] Update this issue with decisions, changed artifacts, verification
  evidence, and remaining risks.

## Safety boundary

This ticket changes presentation and recovery only. It must not fabricate a
preparation, infer eligibility, relax a planner constraint, or promote
synthetic content into the production catalog.

## Decisions

- Use the verified Week edit-option read model already loaded by the page.
- Keep the generic snapshot-unavailable copy for failures whose exact cause
  cannot be safely identified.
- Use the existing `/feeding-setup` route for feeding-eligibility recovery; no
  separate `/feeding-eligibility` route exists.
- Treat only `{ status: "ready", items: [] }` as known planner unavailability.
  The page does not inspect content, profile, or eligibility records to infer a
  more specific reason.
- Replace generation or regeneration with the recovery card only where the
  current editable week would otherwise show the generation form. Other Week
  windows and the generic unavailable read-model path remain unchanged.
- Give each planner browser scenario a unique synthetic fixture and retire all
  currently published local revisions at scenario setup. This preserves
  append-only catalog history while preventing a previous run from determining
  the next run's option set.
- Establish the empty-catalog condition only after a fully configured profile
  has exposed generation against the published fixture. Retire that revision,
  then assert both the unretired approved-revision set and the public published
  preparation read model are empty before reloading Week.

## Changed artifacts

- `src/app/week/page.tsx`
  - branches on the existing successful Week edit-option result;
  - renders the non-diagnostic unavailable card and links to `/foods` and
    `/feeding-setup`;
  - leaves the existing Week plan below the card.
- `tests/e2e/planner-generation.spec.ts`
  - creates unique reviewed fixtures so repeated focused runs are isolated;
  - proves a fully configured profile exposes generation before its only
    published revision is retired;
  - directly proves zero unretired approved revisions and zero preparations in
    the public catalog read model before asserting the unavailable state;
  - preserves the synthetic reviewed fixture generation, lock, and regeneration
    lifecycle;
  - proves later zero-option unavailability preserves committed components and
    creates no rejected generation attempt.

## Verification evidence

- RED:
  `pnpm exec playwright test tests/e2e/planner-generation.spec.ts --grep "no eligible reviewed preparations"`
  first proved one published reviewed preparation, a fully configured eligible
  profile with generation enabled, and then zero published preparations after
  retirement. It failed only because the card still said `for this profile`
  instead of the neutral `right now` copy.
- GREEN:
  the same isolated empty-catalog command passed, 1 test.
- Eligible fixture regression:
  `pnpm exec playwright test tests/e2e/planner-generation.spec.ts --grep "a caregiver generates"`
  passed, 1 test after performing its own cleanup and unique fixture import. The
  eligible fixture generated and regenerated successfully; after it became
  ineligible, Week showed the unavailable state without changing the seven
  committed components.
- `pnpm typecheck` passed.
- `pnpm exec prettier --write src/app/week/page.tsx tests/e2e/planner-generation.spec.ts .scratch/project-little-plate-v1/issues/21-make-planner-unavailability-actionable.md`
  completed.
- `git diff --check` passed.

## Fixture status and remaining risks

- Production seed and catalog artifacts remain unchanged. Browser scenarios use
  unique synthetic reviewed fixtures in the local database only.
- Scenario setup retires currently published local revisions through the
  existing append-only retirement table. Repeated focused runs may accumulate
  retired fixture history, but cannot inherit an active preparation from a
  previous run.
- Reviewed-content publication, preparation eligibility, storage, allergen,
  feeding, and medical semantics were consumed unchanged. No schema, migration,
  seed, or database function changed.
- Verification was intentionally bounded to the two Ticket 21 browser scenarios,
  typecheck, focused formatting, and whitespace checking. The broad repository
  suite was not run for this scoped ticket.

## Final cross-ticket verification

- The final live in-app browser audit showed `Weekly planning is not available
  yet`, neutral `available right now` copy, real `/foods` and `/feeding-setup`
  recovery links, the configured time zone, seven dates, and both meal slots.
  No generation or regeneration button was present.
- Both isolated Ticket 21 browser scenarios passed before final verification:
  the fully configured empty-catalog state and the independently isolated
  eligible generate, lock, and regenerate path.
- The broad Playwright sweep passed 9/19 scenarios while the local Supabase
  stack was degraded. The empty-catalog scenario later could not receive a
  Mailpit message; the eligible scenario reached its final transition but saw
  a stale regeneration control. These broad-run results are not substituted
  for the isolated green evidence or the final live empty-catalog audit.
- Production seed and reviewed safety content remain unchanged.
