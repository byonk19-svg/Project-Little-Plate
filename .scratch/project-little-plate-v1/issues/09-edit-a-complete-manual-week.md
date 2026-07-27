# 09 - Edit a complete manual week

**What to build:** Let a caregiver maintain a realistic seven-day component plan manually, including locks, swaps, copying, deletion, completion, skipping, and one-step undo.

**Blocked by:** 05 - Plan one meal manually.

**Status:** ready-for-agent

- [ ] Week supports the configured one to three meal slots across seven local dates.
- [ ] A caregiver can lock and unlock a meal or individual component.
- [ ] A caregiver can swap one component, swap a whole meal, or choose a quick backup.
- [ ] A caregiver can undo the most recent swap through a bounded compensating action.
- [ ] A caregiver can add or delete a component, copy a meal, and mark a meal skipped or completed.
- [ ] Every added or swapped preparation is revalidated against current approval, skills, and restrictions.
- [ ] Failed edits leave the committed plan unchanged and explain the actionable cause.
- [ ] Status, locks, and edits survive refresh and appear consistently across applicable views.
- [ ] Prior and future planning windows can be viewed without turning the mobile interface into a spreadsheet.
- [ ] A supportive variety summary uses descriptive language without grades, streaks, failure colors, or nutritional diagnosis.
- [ ] Integration tests cover every edit command, undo scope, stale state, and cross-household access.
- [ ] Browser coverage proves the full manual Week workflow on a narrow viewport.
- [ ] Update this issue with verification evidence and any deferred edit behavior.
