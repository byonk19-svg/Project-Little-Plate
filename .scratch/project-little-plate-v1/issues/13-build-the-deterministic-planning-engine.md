# 13 - Build the deterministic planning engine

**What to build:** Produce a pure, reproducible weekly planning result that applies non-overridable safety constraints, practical soft goals, and a reviewed storage-feasibility pass before any plan can be saved.

**Blocked by:** 10 - Complete the Kitchen lifecycle; 11 - Propagate reaction blocks everywhere; 12 - Derive preparation work and groceries.

**Status:** ready-for-agent

- [ ] Planner input explicitly snapshots approved preparations, skills, restrictions, exposure state, valid inventory, quick backups, meal count, preferences, locks, rule revisions, time zone, and clock.
- [ ] Planner output is reproducible from the same input and independent of database row order.
- [ ] Restricted, reaction-blocked, skill-incompatible, unpublished, expired, and deadline-infeasible candidates are disqualified before scoring.
- [ ] Numeric or weighted soft goals cannot reintroduce a disqualified candidate.
- [ ] Soft goals prioritize expiring valid refrigerator inventory, useful frozen inventory, familiar pairing, preparation reuse, variety, quick backups, and caregiver preparation preference.
- [ ] Exact plate repetition and new preparation work can be discouraged without creating guilt-oriented scores.
- [ ] Plain-language explanations come from deterministic reason codes rather than numeric scores or generated safety copy.
- [ ] The feasibility pass allocates existing valid batches first, calculates required new portions, and uses refrigerator/freezer transitions only where approved rules permit.
- [ ] Reviewed thaw tasks are produced when required.
- [ ] Any remaining impossible meal produces a typed actionable infeasibility result.
- [ ] A failed result contains no partial plan eligible for persistence.
- [ ] Golden fixtures cover normal, restricted, no-inventory, expiring-inventory, locked, and infeasible weeks.
- [ ] Property-oriented tests prove hard-constraint invariants across varied candidate sets.
- [ ] Update this issue with verification evidence, fixture rationale, and unresolved scoring policy.
