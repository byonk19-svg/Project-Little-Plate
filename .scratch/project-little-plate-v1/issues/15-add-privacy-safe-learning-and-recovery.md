# 15 - Add privacy-safe learning and recovery

**What to build:** Measure whether the core workflow is useful and make common stale, retry, and network failures recoverable without collecting sensitive child or reaction details.

**Blocked by:** 08 - Surface use-soon and block expiration; 10 - Complete the Kitchen lifecycle; 14 - Generate and regenerate a feasible week.

**Status:** ready-for-agent

- [ ] Emit only the approved core workflow events and non-sensitive failure reason codes.
- [ ] Analytics payloads exclude exact birthdate, free-text notes, reaction descriptions, allergy details, and medical content.
- [ ] Automated tests inspect representative analytics payloads rather than trusting event-call sites.
- [ ] Today-open, meal-choice time, serving, batch outcome, swap, quick-backup, generation, and generation-failure events are sufficient to evaluate PRD dogfood questions.
- [ ] Duplicate client retries do not produce misleading duplicate outcome events.
- [ ] Stale tabs receive explicit refresh/retry behavior for serving, batch transitions, plan edits, and generation.
- [ ] Optimistic UI is used only where failure can roll back without temporarily presenting unsafe inventory as available.
- [ ] Poor-network and interrupted-command states recover without routine database repair.
- [ ] Feedback capture records workflow friction without inviting sensitive clinical detail.
- [ ] Operational views can identify stale batch records through privacy-safe state rather than free-text inspection.
- [ ] Browser coverage exercises representative offline/poor-network, retry, stale-state, and rollback flows.
- [ ] Update this issue with verification evidence and a documented analytics field inventory.
