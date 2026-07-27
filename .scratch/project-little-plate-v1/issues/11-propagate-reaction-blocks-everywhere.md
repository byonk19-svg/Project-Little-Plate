# 11 - Propagate reaction blocks everywhere

**What to build:** Let a caregiver report a reaction without receiving a diagnosis, then immediately prevent the affected food from remaining actionable in Today, Week, or future automatic suggestions.

**Blocked by:** 07 - Serve one portion atomically from Today; 09 - Edit a complete manual week.

**Status:** ready-for-agent

- [ ] A caregiver may record optional preference separately from a reaction report after serving.
- [ ] Reaction reporting does not ask the application to interpret symptoms or determine allergy status.
- [ ] The interface presents reviewed direction to seek appropriate care without generating medical advice.
- [ ] A reaction report immediately creates an active safety block for the food.
- [ ] Today removes or blocks affected actionable recommendations.
- [ ] Future Week meals containing the food are flagged for required replacement rather than silently considered valid.
- [ ] Manual additions, swaps, quick backups, and direct commands cannot bypass the block.
- [ ] Future deterministic planning inputs exclude the blocked food.
- [ ] Ordinary preference editing cannot clear the safety block.
- [ ] Resolving a block requires a separate explicit action with an auditable state change.
- [ ] Free-text reaction descriptions and allergy details are excluded from general analytics payloads and logs.
- [ ] Integration tests prove immediate propagation and direct-service enforcement.
- [ ] Browser coverage proves report, blocked Today state, and affected future-meal replacement.
- [ ] Update this issue with verification evidence and reviewed-copy dependencies.
