# 21 - Make planner unavailability actionable

**What to build:** Replace the impossible automatic-generation action with a
clear recovery state when Week has no eligible reviewed preparation options.

**Blocked by:** 14 - Generate and regenerate a feasible week.

**Status:** complete

- [x] Week does not render an enabled generation action when the verified
  option set contains no eligible reviewed preparations.
- [x] The unavailable state explains that no eligible reviewed preparation is
  currently available without guessing why.
- [x] The state links to Foods and Feeding eligibility as the safe recovery
  surfaces.
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
- Treat only `{ status: "ready", items: [] }` as known planner unavailability.
  The page does not inspect content, profile, or eligibility records to infer a
  more specific reason.
- Replace generation or regeneration with the recovery card only where the
  current editable week would otherwise show the generation form. Other Week
  windows and the generic unavailable read-model path remain unchanged.
- Import the synthetic reviewed catalog fixture inside the eligible-generation
  browser scenario so the empty-catalog scenario exercises the production-safe
  catalog first.

## Changed artifacts

- `src/app/week/page.tsx`
  - branches on the existing successful Week edit-option result;
  - renders the non-diagnostic unavailable card and links to `/foods` and
    `/feeding-eligibility`;
  - leaves the existing Week plan below the card.
- `tests/e2e/planner-generation.spec.ts`
  - covers the production-safe empty catalog at the mobile browser seam;
  - preserves the synthetic reviewed fixture generation, lock, and regeneration
    lifecycle;
  - proves later zero-option unavailability preserves committed components and
    creates no rejected generation attempt.

## Verification evidence

- RED:
  `pnpm exec playwright test tests/e2e/planner-generation.spec.ts --grep "no eligible reviewed preparations"`
  failed because `Generate a reviewed week` was present (`Received: 1`,
  `Expected: 0`) while all seven days and slots had rendered.
- GREEN:
  the same focused empty-catalog command passed, 1 test.
- Eligible fixture regression:
  `pnpm exec playwright test tests/e2e/planner-generation.spec.ts --grep "a caregiver generates"`
  passed, 1 test. The eligible fixture generated and regenerated successfully;
  after it became ineligible, Week showed the unavailable state without changing
  the seven committed components.
- `pnpm typecheck` passed.
- `pnpm exec prettier --write src/app/week/page.tsx tests/e2e/planner-generation.spec.ts .scratch/project-little-plate-v1/issues/21-make-planner-unavailability-actionable.md`
  completed.
- `git diff --check` passed.

## Fixture status and remaining risks

- Production content remains empty. The only reviewed preparation used by the
  ready-state regression is the existing synthetic browser fixture imported by
  that scenario.
- Reviewed-content publication, preparation eligibility, storage, allergen,
  feeding, and medical semantics were consumed unchanged. No schema, migration,
  seed, or database function changed.
- Verification was intentionally bounded to the two Ticket 21 browser scenarios,
  typecheck, focused formatting, and whitespace checking. The broad repository
  suite was not run for this scoped ticket.
