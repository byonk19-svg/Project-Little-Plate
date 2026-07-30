# 21 - Make planner unavailability actionable

**What to build:** Replace the impossible automatic-generation action with a
clear recovery state when Week has no eligible reviewed preparation options.

**Blocked by:** 14 - Generate and regenerate a feasible week.

**Status:** ready-for-agent

- [ ] Week does not render an enabled generation action when the verified
  option set contains no eligible reviewed preparations.
- [ ] The unavailable state explains that no eligible reviewed preparation is
  currently available without guessing why.
- [ ] The state links to Foods and Feeding eligibility as the safe recovery
  surfaces.
- [ ] No plan is generated, partially saved, or changed from this state.
- [ ] Existing Week dates, slots, locks, status, and committed components
  remain visible.
- [ ] Transport, authentication, and snapshot failures retain distinct
  fail-safe handling.
- [ ] Eligible synthetic fixtures continue to expose and complete generation.
- [ ] Mobile-browser coverage proves both the empty-catalog state and the
  eligible generation regression path.
- [ ] Update this issue with decisions, changed artifacts, verification
  evidence, and remaining risks.

## Safety boundary

This ticket changes presentation and recovery only. It must not fabricate a
preparation, infer eligibility, relax a planner constraint, or promote
synthetic content into the production catalog.

## Decisions

- Use the verified Week edit-option read model already loaded by the page.
- Keep the generic snapshot-unavailable copy for failures whose exact cause
  cannot be safely identified.

## Evidence

Pending implementation.
