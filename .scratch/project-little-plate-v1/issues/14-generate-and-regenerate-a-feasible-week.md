# 14 - Generate and regenerate a feasible week

**What to build:** Let a caregiver request a deterministic week, understand important choices or failures, preserve locked decisions during regeneration, and commit only a complete feasible result.

**Blocked by:** 13 - Build the deterministic planning engine.

**Status:** ready-for-agent

- [ ] A caregiver can generate a week from current approved profile, inventory, plan, and content state.
- [ ] Generation displays a useful pending state without presenting partial recommendations as committed.
- [ ] A feasible result contains the configured meal slots and one to three eligible components per planned meal.
- [ ] Important inventory, familiarity, preparation, and variety choices have plain-language explanations.
- [ ] An infeasible result names actionable non-sensitive reasons and does not modify the committed plan.
- [ ] Regeneration preserves locked meals and locked components exactly.
- [ ] Generation commits the new plan and its reproducibility metadata atomically.
- [ ] Concurrent generation requests cannot interleave partial plan versions.
- [ ] The resulting Week immediately produces synchronized Kitchen and grocery derivations.
- [ ] Direct-service attempts cannot save planner output that bypasses current hard constraints or feasibility validation.
- [ ] Integration tests cover feasible, infeasible, stale-input, retry, concurrency, and locked-regeneration cases.
- [ ] Browser coverage proves generation, explanation, failure recovery, locks, and regeneration.
- [ ] Update this issue with verification evidence and the golden input/output identifiers used.
