# 12 - Derive preparation work and groceries

**What to build:** Turn the committed manual week into a consolidated Kitchen work plan and compact grocery list that stay synchronized without erasing caregiver-owned overrides.

**Blocked by:** 09 - Edit a complete manual week; 10 - Complete the Kitchen lifecycle.

**Status:** ready-for-agent

- [ ] Kitchen groups required work by practical action rather than repeating tasks meal by meal.
- [ ] Each preparation need identifies the meals it supports.
- [ ] Quantities use practical portion units and avoid false-precision grams.
- [ ] Completing a preparation task can start batch creation with the preparation already selected.
- [ ] Dismissing a reminder hides that task instance without deleting its underlying meal requirement.
- [ ] Grocery need is derived from the committed plan after subtracting assigned valid inventory, available quick backups, and already-have state.
- [ ] Duplicate foods merge and display in practical store sections.
- [ ] A caregiver can add, edit, check, and delete manual grocery items.
- [ ] Manual items remain through plan edits unless the caregiver removes them.
- [ ] Plan-derived and manual grocery items remain visibly distinguishable.
- [ ] Swaps, deletions, copies, completion, restriction changes, and inventory changes recompute applicable derived state deterministically.
- [ ] Failed plan edits cannot leave Kitchen or grocery state synchronized to an uncommitted plan.
- [ ] Domain/integration tests cover derivation and every upstream edit class.
- [ ] Browser coverage proves Week-to-Kitchen and Week-to-grocery synchronization.
- [ ] Update this issue with verification evidence and any deliberately deferred task grouping.
