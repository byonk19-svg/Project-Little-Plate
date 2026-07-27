# 04 - Configure and enforce feeding eligibility

**What to build:** Let a caregiver record observable feeding abilities, restrictions, exposure state, planning preferences, and quick backups, then use that state to conservatively identify which reviewed preparations may be selected.

**Blocked by:** 02 - Create an authenticated baby profile; 03 - Browse one reviewed preparation.

**Status:** ready-for-agent

- [ ] A caregiver can record each supported feeding ability as observed, not observed, or not sure and revise it later.
- [ ] Not-sure or missing ability never becomes proof of preparation eligibility.
- [ ] A caregiver can record confirmed allergy, directed exclusion, temporary avoidance, and no known restriction.
- [ ] A caregiver can seed liked, neutral, disliked, not-tried, skipped, or unknown exposure state from no more than 15 foods and may skip the step.
- [ ] Unknown exposure remains distinct from not tried.
- [ ] A caregiver can select new-food pace, preparation-time preference, optional prep day, and up to eight quick backups.
- [ ] Safety status and caregiver preference are represented independently.
- [ ] Eligibility uses only active approved preparations and requires the recorded abilities defined by that preparation.
- [ ] Confirmed allergy, directed exclusion, temporary avoidance, and reaction-reported status disqualify a food regardless of preference.
- [ ] The UI explains unavailable or unsupported eligibility without diagnosing feeding ability.
- [ ] Direct application/service calls cannot bypass eligibility rules exposed by the UI.
- [ ] Domain tests cover restriction precedence, unknown skills, preference/safety separation, and approved-content requirements.
- [ ] Browser coverage proves the conservative setup and later editing flow.
- [ ] Update this issue with verification evidence and any unsupported policy question.
