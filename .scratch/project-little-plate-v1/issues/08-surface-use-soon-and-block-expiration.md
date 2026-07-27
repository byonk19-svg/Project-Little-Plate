# 08 - Surface use-soon and block expiration

**What to build:** Make approaching and crossed deadlines visible and actionable, while ensuring a batch can never be served once its exact deadline has passed.

**Blocked by:** 07 - Serve one portion atomically from Today.

**Status:** ready-for-agent

- [ ] Today shows refrigerated batches due within the next 24 elapsed hours ordered by exact deadline.
- [ ] Kitchen defaults refrigerator inventory to earliest deadline first.
- [ ] A batch at its exact discard instant is expired and excluded from available inventory.
- [ ] Expired batches move to a distinct section and are not selectable for meals or serving.
- [ ] A screen left open across the deadline is revalidated at command time and receives a clear expired/stale result.
- [ ] The caregiver can use the item in the next meal, inspect the rule explanation, or discard it when applicable.
- [ ] Freezing is offered only for untouched portions with a reviewed transition rule; this ticket does not invent thaw policy.
- [ ] Reopening the application, changing a meal, or changing the local clock cannot extend the deadline.
- [ ] Use-soon calculation and local copy remain correct across daylight-saving transitions.
- [ ] Domain tests cover immediately before, exactly at, and immediately after expiration.
- [ ] Integration tests prove expired batches are blocked through direct commands.
- [ ] Browser coverage proves use-soon display, deadline crossing, and expired cleanup.
- [ ] Update this issue with verification evidence and boundary timestamps.
