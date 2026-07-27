# 10 - Complete the Kitchen lifecycle

**What to build:** Let a caregiver safely move portions through refrigerator, freezer, thawing, serving, return-untouched, discard, finish, and correction states while preserving an explainable history.

**Blocked by:** 06 - Prepare and refrigerate two portions; 08 - Surface use-soon and block expiration.

**Status:** ready-for-agent

- [ ] Every supported event records actor, UTC occurrence time, quantity effect, and required metadata.
- [ ] Invalid prior-state transitions are rejected without appending a partial event.
- [ ] Freezer inventory distinguishes quality-by guidance from discard-after deadlines.
- [ ] Freeze is available only for untouched portions and when an approved transition rule permits it.
- [ ] Begin-thaw and thawed actions require reviewed method, clock-start, post-thaw deadline, and refreezing policy.
- [ ] Frozen time never resets an earlier refrigerator clock unless the approved rule explicitly defines that behavior.
- [ ] A served-dish or saliva-exposed leftover cannot return to available inventory.
- [ ] An untouched separately stored portion may return only through the explicit reviewed transition.
- [ ] Discard and finish remove portions from availability without deleting history.
- [ ] Correction appends a compensating event and never edits or removes the original event.
- [ ] No sequence or concurrent command can make the projected remaining quantity negative.
- [ ] A reconciliation check can prove the cached projection matches the authoritative event ledger.
- [ ] Domain and integration tests cover legal transitions, illegal transitions, retries, concurrency, and reconciliation.
- [ ] Browser coverage proves the applicable refrigerator/freezer lifecycle.
- [ ] Update this issue with verification evidence and all unsupported transitions.
