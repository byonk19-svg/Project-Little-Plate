# 05 - Plan one meal manually

**What to build:** Let a caregiver place one eligible reviewed preparation into tomorrow's configured meal slot and see that simple component-based meal in Week.

**Blocked by:** 04 - Configure and enforce feeding eligibility.

**Status:** ready-for-agent

- [x] Week presents the current seven-day window and the configured meal slots in a narrow-phone layout.
- [x] A caregiver can browse an eligible preparation and add it to a meal on tomorrow's local date.
- [x] A meal supports one to three preparation components.
- [x] Date interpretation uses the baby profile's IANA time zone rather than the server's local date.
- [x] Restricted, reaction-blocked, skill-incompatible, unpublished, retired, and unsupported preparations cannot be attached through UI or direct commands.
- [x] The saved component retains enough approved preparation identity to be revalidated later.
- [x] A successful edit appears consistently in Week without requiring automatic plan generation.
- [x] A failed edit leaves the prior plan unchanged and returns an actionable reason.
- [x] Integration tests cover allowed, cross-household, restricted, incompatible, unpublished, and daylight-saving-adjacent cases.
- [x] Browser coverage proves the Foods-to-tomorrow-Week path.
- [x] Update this issue with verification evidence and remaining risks.

## Implementation record

### Repository context

- Root `CONTEXT.md` is absent in this checkout. Ticket 05 used this issue, the
  canonical PRD, the approved execution plan, ADRs 0002 through 0004, and the
  completed Ticket 02 through 04 implementation as its context sources.

### Decisions

- One household-owned manual plan belongs to the active baby. Dated meals belong
  to that plan, and each configured meal slot accepts one to three distinct
  preparation components.
- Every component stores both its stable preparation ID and exact approved
  content revision ID. A composite foreign key proves that the revision belongs
  to that preparation, preserving enough identity for later revalidation.
- Authenticated caregivers have RLS-protected read access and no direct table
  write grant. One transactional command is the only caregiver write path.
- The command verifies the caller's active baby, configured meal slot, Ticket
  04 eligibility, Ticket 03 publication state, and component limit at execution
  time. The active baby row serializes eligibility reads against feeding setup
  writes, the approved revision row serializes publication reads against
  retirement, edits to one baby/date/slot serialize component changes, and a
  repeated request for the same preparation is idempotent.
- Today and tomorrow are calendar dates calculated from the database instant in
  the baby profile's IANA time zone. Week is a rolling seven-local-date read
  model and never relies on the server's configured local date.
- Expected failures return stable, actionable reason codes without changing the
  prior plan. The UI maps those reasons to recovery guidance and does not use
  optimistic safety state.
- Automatic generation, locks, swaps, copy, delete, skip, completion, undo,
  Kitchen derivation, and grocery derivation remain outside Ticket 05.

The durable boundary and reversal conditions are recorded in
`docs/adr/0005-manual-meal-planning-boundary.md`.

### Fixture review status

- `tests/integration/manual-meal-planning.test.ts`: synthetic,
  conspicuously test-only reviewed-content fixtures. They cover eligible,
  restricted, reaction-blocked, skill-incompatible, draft, retired, missing,
  cross-household, component-limit, configured-slot, RLS, and
  daylight-saving-adjacent behavior. They are not qualified production content.
  Teardown retires any still-active approved Ticket 05 fixture revisions so
  the append-only content model is preserved without leaking active catalog
  rows into the earlier-ticket integration suites.
- `tests/e2e/manual-meal-planning.spec.ts`: synthetic, conspicuously test-only
  browser fixture. It proves the real Foods, eligibility, manual-command,
  Supabase, and narrow-phone Week path. It is not qualified production content.
- `supabase/seed.sql`: unchanged and contains zero food, preparation, feeding,
  allergen, storage, or medical guidance fixtures.

### Verification evidence

- `pnpm verify`: passed. This included formatting, lint, strict typechecking, 18
  unit/component tests, the production build, a clean database reset through
  all five migrations, 26 real-Supabase integration tests, eight mobile
  Chromium flows, and the repository whitespace gate.
- `tests/integration/manual-meal-planning.test.ts`: six tests passed after a
  clean reset, including allowed placement, one-to-three enforcement, failure
  atomicity, household isolation, all required eligibility/publication
  rejections, deterministic concurrent restriction/retirement commits, and
  DST-adjacent local dates.
- `tests/e2e/manual-meal-planning.spec.ts`: the narrow-phone Foods to tomorrow to
  Week path passed and had no horizontal overflow.
- `pnpm exec supabase db lint --local`: no schema errors found.
- Supabase local security and performance advisors: no issues found at warning
  level with error-level failure enabled.
- The required two-axis review found no remaining acceptance, safety,
  standards, security, or code-quality issues after its concurrency,
  canonical-status, shared-helper, and fixture-isolation findings were
  resolved.
- `git diff --check`: passed.

### Changed artifacts

- `supabase/migrations/20260727233000_plan_one_meal_manually.sql`
- `src/modules/meals/`
- `src/app/foods/[slug]/manual-meal-form.tsx`
- `src/app/foods/[slug]/page.tsx`
- `src/app/week/page.tsx`
- `src/app/globals.css`
- `tests/integration/manual-meal-planning.test.ts`
- `tests/e2e/manual-meal-planning.spec.ts`
- `docs/adr/0005-manual-meal-planning-boundary.md`
- `README.md`

### Remaining risks

- Production seed data intentionally still contains no qualified reviewed food
  or preparation. A clean environment therefore presents the safe empty state
  until the external qualified-review workstream supplies approved content.
- Ticket 05 retains exact preparation and revision identity but does not yet
  surface an already planned component that becomes newly blocked. Replacement
  surfacing and later Week lifecycle edits remain explicitly assigned to
  Tickets 09 and 11.
