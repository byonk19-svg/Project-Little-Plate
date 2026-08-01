# 04 - Configure and enforce feeding eligibility

**What to build:** Let a caregiver record observable feeding abilities, restrictions, exposure state, planning preferences, and quick backups, then use that state to conservatively identify which reviewed preparations may be selected.

**Blocked by:** 02 - Create an authenticated baby profile; 03 - Browse one reviewed preparation.

**Status:** complete

- [x] A caregiver can record each supported feeding ability as observed, not observed, or not sure and revise it later.
- [x] Not-sure or missing ability never becomes proof of preparation eligibility.
- [x] A caregiver can record confirmed allergy, directed exclusion, temporary avoidance, and no known restriction.
- [x] A caregiver can seed liked, neutral, disliked, not-tried, skipped, or unknown exposure state from no more than 15 foods and may skip the step.
- [x] Unknown exposure remains distinct from not tried.
- [x] A caregiver can select new-food pace, preparation-time preference, optional prep day, and up to eight quick backups.
- [x] Safety status and caregiver preference are represented independently.
- [x] Eligibility uses only active approved preparations and requires the recorded abilities defined by that preparation.
- [x] Confirmed allergy, directed exclusion, temporary avoidance, and reaction-reported status disqualify a food regardless of preference.
- [x] The UI explains unavailable or unsupported eligibility without diagnosing feeding ability.
- [x] Direct application/service calls cannot bypass eligibility rules exposed by the UI.
- [x] Domain tests cover restriction precedence, unknown skills, preference/safety separation, and approved-content requirements.
- [x] Browser coverage proves the conservative setup and later editing flow.
- [x] Update this issue with verification evidence and any unsupported policy question.

## Implementation record

### Decisions

- Feeding setup choices come only from skill tags and foods used by currently
  active, approved, unretired preparations that satisfy Ticket 03's complete
  publication boundary.
- A missing food safety status fails closed. Eligibility requires an explicit
  `no_known_restriction` record as well as every reviewed required ability
  recorded as `observed`.
- `not_sure`, `not_observed`, and missing ability state are all conservative
  non-evidence. The UI explains this without assessing or diagnosing ability.
- Restriction state, exposure/preference state, planning preferences, and quick
  backups are separate records. Exposure or preference never changes safety
  eligibility.
- Ordinary setup edits cannot clear `reaction_reported`; that state remains
  blocked until Ticket 11 introduces the explicit resolution flow.
- One authenticated transaction replaces the editable setup state, validates a
  maximum of 15 exposure foods and eight backups, and rejects identifiers that
  are not in the reviewed setup options. Household clients have RLS-protected
  read access and no direct table-write grant.
- Restrictions and backups can reference every currently published food; only
  the optional exposure quick-select is capped at 15. Exposure history is
  preserved when catalog ordering moves a previously recorded food outside that
  quick-select.
- V1 convenience inputs use explicit non-safety choices: zero through three new
  foods per week, under 15 minutes, under 30 minutes, or flexible preparation
  time, plus an optional day of week.

The durable boundary is recorded in
`docs/adr/0004-feeding-eligibility-boundary.md`.

### Fixture review status

- `tests/integration/feeding-eligibility.test.ts`: synthetic, conspicuously
  test-only reviewed-content fixtures. They exercise 16 published foods,
  multiple required abilities, restriction precedence, reaction blocking,
  direct-call enforcement, RLS, and configuration limits. They are not
  qualified production content.
- `tests/e2e/feeding-eligibility.spec.ts`: synthetic, conspicuously test-only
  browser fixture. It proves conservative setup and later editing through the
  real publication and Supabase seams. It is not qualified production content.
- `supabase/seed.sql`: unchanged and contains zero food, preparation, ability,
  allergen, storage, or medical guidance fixtures.

### Unsupported policy questions

- No unsupported feeding, preparation, allergen, storage, or medical policy was
  introduced. Exact new-food pace and preparation-time choices were required by
  the ticket but not enumerated by the PRD; they are recorded as reversible
  planning-preference defaults in ADR 0004 and do not affect safety eligibility.

### Verification evidence

- `pnpm verify`: formatting, lint, typecheck, 18 unit tests, and the production
  build passed. The database reset applied all four migrations successfully,
  but the wrapper's immediate final `supabase start` failed its Realtime health
  check. A separate `pnpm exec supabase start` completed successfully once the
  same containers finished starting; this is a local Supabase CLI/container
  restart race rather than an application or migration failure.
- `pnpm test:integration`: 20 tests passed against the real local Supabase
  boundary, including six Ticket 04 tests.
- `pnpm test:e2e`: seven mobile Chromium flows passed, including conservative
  feeding setup and later revision.
- `pnpm exec supabase db lint --local`: no schema errors found.
- Supabase security and performance advisors were reviewed after the DDL
  changes; no Ticket 04 finding remained.
- `node scripts/check-whitespace.mjs`: passed.
- `git diff --check`: passed.
- The implement flow's specification and standards/security review axes passed
  after resolving publication-lifecycle modeling, setup-list scoping,
  historical exposure preservation, and duplicated test-harness findings.

### Changed artifacts

- `supabase/migrations/20260727210000_configure_feeding_eligibility.sql`
- `src/modules/eligibility/`
- `src/app/feeding-setup/`
- `src/app/foods/[slug]/page.tsx`
- `src/app/today/page.tsx`
- `src/components/shell/app-shell.tsx`
- `src/app/globals.css`
- `tests/integration/feeding-eligibility.test.ts`
- `tests/integration/support/local-supabase.ts`
- `tests/e2e/feeding-eligibility.spec.ts`
- `tests/e2e/support/passwordless-auth.ts`
- `docs/adr/0004-feeding-eligibility-boundary.md`
- `README.md`

### Remaining risks

- Production seed data intentionally still contains no reviewed food or
  preparation content. A clean environment therefore presents the safe empty
  state until qualified reviewed content is supplied.
- Qualified review of production safety content remains an external release
  dependency. The Ticket 04 fixtures are synthetic and test-only.
