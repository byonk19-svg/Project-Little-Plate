# 18 - Pass the closed-beta gate

**What to build:** Assemble and verify the technical, workflow, content, privacy, accessibility, and human-review evidence required to invite a small external beta without routine privileged repair.

**Blocked by:** 14 - Generate and regenerate a feasible week; 15 - Add privacy-safe learning and recovery; 16 - Add deletion and operational controls; 17 - Expand through the reviewed catalog pipeline.

**External gates:** At least two weeks of real dogfood, qualified safety/content approvals, and privacy/legal review require authorized human participants.

**Status:** ready-for-human

- [ ] Record at least 10 real-use days across a minimum two-week dogfood period without placing sensitive notes in the issue.
- [ ] Classify observed friction and defects by safety impact, workflow impact, reproducibility, and release severity.
- [ ] Resolve every P0/P1 safety or core-workflow defect with focused regression coverage.
- [x] Demonstrate that routine onboarding, planning, preparation, storage, serving, correction, and deletion require no manual database repair.
- [x] Run the complete repository verification command successfully from the release candidate.
- [x] Run migration reset, RLS isolation, direct-service bypass, concurrency, deadline, content validation, and source-link suites.
- [x] Complete mobile browser coverage for every critical V1 workflow and recovery state.
- [ ] Complete a WCAG 2.2 AA-focused audit and resolve release-blocking findings.
- [ ] Verify Today performance and catalog-search targets under a representative mobile profile.
- [ ] Record qualified content, clinician/allergy, privacy, and legal approvals without embedding private reviewer data unnecessarily.
- [x] Verify zero known cases where the app recommends expired, restricted, unpublished, unavailable, saliva-exposed, or skill-incompatible food.
- [x] Verify account deletion, emergency content retirement, backup restoration, and incident procedures.
- [ ] Record explicit go/no-go ownership, remaining lower-severity risks, and rollback conditions.
- [x] Update this issue with the final evidence index and release decision.

## Release decision

**NO-GO for external beta.** The synthetic engineering candidate is being
verified, but required real-use, production-content, representative
performance, manual accessibility, privacy/legal, and qualified clinical
evidence is absent. No synthetic fixture or agent assertion is accepted as a
substitute.

The durable evidence index, human evidence contract, severity rubric,
go/no-go ownership requirements, and rollback conditions are in
`docs/release/closed-beta-gate.md`.

## Engineering changes

- Replaced the Ticket 06 integration fixture's wall-clock-expired stored batch
  with a server-relative prepared time while preserving the fixed-clock
  deadline preview. The complete 19-test storage/lifecycle file now remains
  deterministic after July 29, 2026.
- Increased the local Auth readiness allowance from 15 to 30 seconds for
  disposable-stack restarts. This changes test orchestration only.
- Added one Axe-powered mobile audit loop over Today, Week, Kitchen, and Foods.
  Existing shell coverage continues to verify keyboard activation, current
  destination text/semantics, horizontal overflow, and 44px navigation
  targets.

## Acceptance status

- **Blocked — real dogfood:** no evidence for 10 real-use days spanning at
  least two weeks was supplied.
- **Blocked — observed-friction classification:** no de-identified real-use
  findings were supplied. The committed rubric is ready for the human
  workstream.
- **Engineering evidence available — P0/P1 regression policy:** automated
  safety, isolation, concurrency, lifecycle, deletion, and recovery suites
  exist. Real-use P0/P1 closure cannot be asserted without dogfood findings.
- **Engineering evidence available — routine workflows:** synthetic mobile and
  database suites exercise onboarding, eligibility, Foods, planning,
  preparation, storage, serving, correction, reactions, recovery, and
  deletion without manual repair.
- **Engineering evidence complete:** repository verification, database
  lint/advisors, source checks, restore rehearsal, and whitespace checks passed
  as recorded below.
- **Limited automated accessibility evidence available:** the signed-out or
  empty primary mobile destinations have no Axe-supported WCAG 2.2 A/AA
  violations in the focused run. Populated authenticated states and manual
  screen-reader/zoom/high-contrast checks remain unverified.
- **Blocked — representative performance:** authenticated Today has not been
  measured in a deployed representative mobile/network profile. Synthetic
  local timings are not promoted to release evidence.
- **Blocked — reviewed catalog and content QA:** the clean production seed has
  zero foods, and qualified content/visual/clinician approvals are absent.
- **Blocked — privacy/legal/clinical approvals:** no authorized approval
  references were supplied.
- **Blocked — external cohort readiness:** without the gates above, the
  repository cannot demonstrate a small external cohort operating safely.

## External evidence required to unblock

The authorized release owner must add references for:

1. at least ten real-use dates over a period of fourteen or more days;
2. de-identified, severity-classified findings and closure evidence for every
   P0/P1;
3. qualified catalog, pediatric feeding, clinician/allergy, privacy, and legal
   approvals;
4. manual NVDA/TalkBack, 200% zoom, high-contrast, reduced-motion, and complete
   keyboard evidence;
5. representative authenticated Today and catalog-search performance results;
6. production backup retention, restore, incident, monitoring, and promotion
   owners; and
7. the named go/no-go owner, decision date, accepted lower-severity risks, and
   rollback authority.

Do not include exact birthdates, allergy details, reaction descriptions,
medical notes, caregiver notes, or private reviewer contact information.

## Final evidence

- `pnpm verify` — passed from the release candidate: formatting, lint,
  typecheck, production build, whitespace validation, 113 unit tests, 6
  catalog-source tests, migration reset, 64 integration tests, and 15 mobile
  browser tests.
- `pnpm operations:rehearse-restore` — passed. The isolated restore preserved
  16 migrations, 41 RLS-enabled tables, 23 policies, deletion capability for
  caregivers, and service-only content retirement.
- `pnpm exec supabase db lint --local --level warning` — passed with no schema
  errors.
- `pnpm exec supabase db advisors --local --type all --level warn --fail-on error`
  — passed with no issues.
- Clean `pnpm exec supabase db reset --local` followed by
  `pnpm catalog:check-sources` — passed with `checked: 0` and `broken: 0`,
  confirming that the production seed contains no unreviewed catalog package.
- Two-axis Ticket 18 review — passed after adding the missing Axe `wcag21a`
  tag and narrowing the evidence statement to signed-out/empty states.
- `git diff --check` — passed on the final unstaged diff; the staged diff is
  checked again immediately before commit.

Remaining release risks are the unchecked human/external acceptance criteria
above: dogfood and finding closure, populated authenticated and manual
accessibility coverage, representative performance, qualified content and
clinical/privacy/legal approvals, production operational ownership, and a
named go/no-go owner. These are release-blocking, so the decision remains
**NO-GO**.
