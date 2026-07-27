# 06 - Prepare and refrigerate two portions

**What to build:** Let a caregiver turn a planned preparation into a two-portion refrigerated batch, see the reviewed rule before saving, and receive an exact explained deadline in Kitchen.

**Blocked by:** 05 - Plan one meal manually.

**Status:** ready-for-agent

- [ ] Deadline selection and elapsed-hour calculation are pure, deterministic, and accept an explicit clock and rule revision.
- [ ] A reviewed range uses the documented conservative endpoint unless a more specific approved rule applies.
- [ ] Missing or ambiguous rule inputs produce a typed unsupported result and never a guessed deadline.
- [ ] Batch creation accepts preparation, prepared/opened time defaulting to now, portion count, and refrigerator location.
- [ ] The caregiver sees the governing reviewed rule and calculated deadline before confirming.
- [ ] Confirming creates an append-only prepared/opened event, batch state, and deadline linked to its starting event and rule revision.
- [ ] Kitchen shows the preparation, two remaining portions, local prepared time, exact discard deadline, and Ready/Use Today/Expired status.
- [ ] Batch and event ownership are isolated to the correct household and baby.
- [ ] The event ledger is authoritative; any cached portion projection is updated transactionally and can be reconciled.
- [ ] Opening the app or editing a meal cannot move the deadline later.
- [ ] Domain tests cover ranges, rule precedence, exact boundaries, UTC calculation, spring-forward, fall-back, and unsupported input.
- [ ] Integration and browser coverage prove the planned-meal-to-Kitchen path.
- [ ] Update this issue with verification evidence and the exact reviewed fixture used.
