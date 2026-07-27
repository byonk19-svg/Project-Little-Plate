# 05 - Plan one meal manually

**What to build:** Let a caregiver place one eligible reviewed preparation into tomorrow's configured meal slot and see that simple component-based meal in Week.

**Blocked by:** 04 - Configure and enforce feeding eligibility.

**Status:** ready-for-agent

- [ ] Week presents the current seven-day window and the configured meal slots in a narrow-phone layout.
- [ ] A caregiver can browse an eligible preparation and add it to a meal on tomorrow's local date.
- [ ] A meal supports one to three preparation components.
- [ ] Date interpretation uses the baby profile's IANA time zone rather than the server's local date.
- [ ] Restricted, reaction-blocked, skill-incompatible, unpublished, retired, and unsupported preparations cannot be attached through UI or direct commands.
- [ ] The saved component retains enough approved preparation identity to be revalidated later.
- [ ] A successful edit appears consistently in Week without requiring automatic plan generation.
- [ ] A failed edit leaves the prior plan unchanged and returns an actionable reason.
- [ ] Integration tests cover allowed, cross-household, restricted, incompatible, unpublished, and daylight-saving-adjacent cases.
- [ ] Browser coverage proves the Foods-to-tomorrow-Week path.
- [ ] Update this issue with verification evidence and remaining risks.
