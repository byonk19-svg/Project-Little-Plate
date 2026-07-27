# 07 - Serve one portion atomically from Today

**What to build:** Show the planned ready portion on Today and let the caregiver serve it once while protecting inventory from retries, concurrent taps, stale state, and direct-service bypass.

**Blocked by:** 06 - Prepare and refrigerate two portions.

**Status:** ready-for-agent

- [ ] Today places the current or next planned meal first and identifies ready, quick-preparation, or thaw-required state.
- [ ] Today explains in plain language why the prepared component is available.
- [ ] Serving validates caller household, baby, current preparation approval, current restriction state, batch lifecycle, deadline, and remaining portions inside one transaction.
- [ ] Expiration uses trusted server/database time at command execution.
- [ ] Serving appends an event and reduces two portions to one without rewriting prior history.
- [ ] Repeating the same caller-stable idempotency key produces one successful serving outcome and one event.
- [ ] Two concurrent attempts to consume the final portion produce exactly one success.
- [ ] Unauthorized, cross-household, depleted, blocked, expired, or unpublished attempts leave inventory unchanged.
- [ ] Expected failures return stable, non-sensitive reason codes and refreshable caregiver copy.
- [ ] Today, Week, and Kitchen show a consistent result after serving.
- [ ] The default served-as-planned path completes with one confirmation tap and does not require amount eaten.
- [ ] Integration tests prove concurrency, idempotency, rollback, and direct bypass resistance.
- [ ] Mobile browser coverage proves the complete first serve path.
- [ ] Update this issue with verification evidence and concurrency results.
