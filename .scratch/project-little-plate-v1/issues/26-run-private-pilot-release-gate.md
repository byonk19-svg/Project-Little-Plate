# 26 — Run the private-pilot release gate

**What to build:** Operate the qualified ten-food package as a private pilot
for the owner and explicitly authorized testers, verify the populated
parent-facing experience and release evidence, and record an explicit
expand-or-stop decision without opening external caregiver access.

**Blocked by:** 25 - Import and qualify the reviewed private-pilot package

**Status:** needs-triage

This umbrella is split into two ordered slices:

- **26A:** establish the private runtime and explicit tester-access boundary;
  this can proceed without catalog content.
- **26B:** operate the populated ten-food private pilot after Ticket 25 and
  26A are complete.

Ticket 18 remains the authoritative gate for external caregiver beta. It is not
a prerequisite for the owner/tester private pilot.

- [ ] Only the owner and explicitly authorized testers can see the private
      pilot; anonymous and external caregiver reads remain blocked.
- [ ] All ten foods pass Foods, Today, Week, feeding eligibility, planner, and
      manual meal-planning paths without leaking blocked, unpublished,
      retired, expired, or fixture records.
- [ ] Populated accessibility checks cover the pilot states, including
      unavailable and recovery states.
- [ ] Representative performance evidence is recorded for populated pilot
      reads; local CI alone is not treated as performance proof.
- [ ] Every unresolved P0/P1 safety or core-workflow defect blocks expansion
      and has a linked regression or documented human follow-up.
- [ ] Qualified evidence is complete for all ten foods and all applicable
      dimensions before any expansion decision.
- [ ] A named go/no-go owner records expand or stop, accepted lower-severity
      risks, and rollback authority.
- [ ] The result is documented as a private validation pilot, never as public
      availability or an external beta.
- [ ] Ticket 18 external-release evidence remains authoritative and unmet
      evidence keeps external caregiver access closed.
