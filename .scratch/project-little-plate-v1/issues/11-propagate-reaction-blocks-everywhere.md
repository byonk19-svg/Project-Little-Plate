# 11 - Propagate reaction blocks everywhere

**What to build:** Let a caregiver report a reaction without receiving a diagnosis, then immediately prevent the affected food from remaining actionable in Today, Week, or future automatic suggestions.

**Blocked by:** 07 - Serve one portion atomically from Today; 09 - Edit a complete manual week.

**Status:** complete

## Decisions

- A reaction report is available only after a household-owned served event and
  only when the current approved
  `post-serve-reaction-care-direction` revision with complete source and review
  metadata can be resolved. Publication, retirement, and reporting share one
  serialization boundary.
- Reporting and resolution are separate serialized, idempotent database
  commands. Each appends an actor-attributed UTC event; ordinary feeding setup
  cannot clear `reaction_reported`.
- Preference remains in `baby_food_exposures`. An optional private description
  exists only on the household-owned append-only reaction event and is never
  returned by command responses or added to logs or general analytics.
- All current action seams continue to consume the centralized eligibility
  boundary. A dedicated reviewed-input RPC supplies future deterministic
  planning and excludes blocked foods before scoring exists.

## Reviewed-copy dependency and fixture review

- Production seed data contains no reaction guidance. The report action fails
  safely as unavailable until qualified clinician/allergy-reviewed direction
  is imported.
- Integration and browser records use explicit synthetic revisions in the
  canonical guidance lineage, `example.test` sources, synthetic reviewer roles,
  and complete review dates. Each fixture retires its guidance after validation.
- The application renders reviewed text verbatim and does not interpret
  symptoms, assign severity, determine allergy status, or generate medical or
  emergency direction.

- [x] A caregiver may record optional preference separately from a reaction report after serving.
- [x] Reaction reporting does not ask the application to interpret symptoms or determine allergy status.
- [x] The interface presents reviewed direction to seek appropriate care without generating medical advice.
- [x] A reaction report immediately creates an active safety block for the food.
- [x] Today removes or blocks affected actionable recommendations.
- [x] Future Week meals containing the food are flagged for required replacement rather than silently considered valid.
- [x] Manual additions, swaps, quick backups, and direct commands cannot bypass the block.
- [x] Future deterministic planning inputs exclude the blocked food.
- [x] Ordinary preference editing cannot clear the safety block.
- [x] Resolving a block requires a separate explicit action with an auditable state change.
- [x] Free-text reaction descriptions and allergy details are excluded from general analytics payloads and logs.
- [x] Integration tests prove immediate propagation and direct-service enforcement.
- [x] Browser coverage proves report, blocked Today state, and affected future-meal replacement.
- [x] Update this issue with verification evidence and reviewed-copy dependencies.

## Changed artifacts

- `20260728202000_propagate_reaction_blocks.sql` adds versioned reviewed
  reaction guidance, append-only household reaction history, report and resolve
  commands, publication/retirement serialization, immutable serving
  provenance, strict RLS, a retirement-independent active-block read model, and
  safe future-planner inputs.
- The reaction domain and transport modules define preference/safety
  separation and fail-closed reviewed context parsing.
- Today exposes the post-serve report only with reviewed provenance. Feeding
  setup exposes a separate resolution action. Existing Today, Week, Foods,
  Kitchen, batch, serving, and edit paths inherit immediate eligibility
  propagation.
- ADR 0011 records the durable safety and privacy boundary; README describes
  the first eleven slices.

## Acceptance and verification evidence

- Pure reaction transition and strict transport suites pass all 13 cases.
- The focused real-Supabase storage/serving suite passes 18 tests, including
  immediate Today and Week propagation, direct command enforcement, future
  planner-input exclusion, current-guidance publication and retirement races,
  payload-bound lifecycle-stable retry, immutable serving provenance, separate
  preference, private owner-only history, retired-content resolution, and
  explicit audited resolution.
- `pnpm verify` passes: formatting, lint, typecheck, 54 unit tests, production
  build, clean local migration replay, 47 real-Supabase integration tests, 11
  mobile Chromium stories, and whitespace validation.
- The focused mobile Chromium story passes the full reviewed
  serve-report-block-replace-resolve path on the narrow viewport.
- Local `supabase db lint --level warning` reports no schema errors, the local
  migration list includes `20260728202000`, and `git diff --check` passes.
- The issue/spec and standards/safety review axes completed with zero remaining
  actionable findings after publication, retirement, privacy, provenance,
  retired-content resolution, and fixture-cleanup findings were resolved.

## Remaining risks

- No Supabase cloud project is connected, so hosted security and performance
  advisors may remain externally unavailable. Local lint, RLS/integration
  proof, and clean replay are the available database gates.
- Production reaction reporting intentionally remains unavailable until
  qualified reviewed guidance is imported.
