# Private ten-food pilot scope

**Status:** scope contract only — not a publication approval

This document records the bounded private-pilot scope agreed for Ticket 23E.
It is an intake and evidence checklist, not a source of preparation,
allergen, storage, developmental, medical, or visual-rights guidance.

## Release boundary

- The pilot contains exactly 10 candidate foods.
- The pilot is private to the owner and explicitly authorized testers.
- External caregiver access remains blocked by the Ticket 18 closed-beta gate.
- A candidate is unavailable to parent-facing reads until its applicable
  qualified review and provenance are complete.
- No row in this document authorizes production publication or substitutes for
  a qualified review packet.

## Candidate identity slots

The names below are the existing PRD identity targets only. They are not
approved preparation records and must not be used to infer serving, allergen,
storage, developmental, or medical guidance.

| Slot | Candidate identity | Planning coverage bucket (not production taxonomy) | Qualified category | Qualified packet status |
| ---- | ------------------ | -------------------------------------------------- | ------------------ | ----------------------- |
| 01   | egg                | Animal-origin protein                              | Reviewer-supplied  | Required before import  |
| 02   | chicken            | Animal-origin protein                              | Reviewer-supplied  | Required before import  |
| 03   | black beans        | Plant protein/legume                               | Reviewer-supplied  | Required before import  |
| 04   | plain yogurt       | Dairy                                              | Reviewer-supplied  | Required before import  |
| 05   | oatmeal            | Grain                                              | Reviewer-supplied  | Required before import  |
| 06   | sweet potato       | Produce                                            | Reviewer-supplied  | Required before import  |
| 07   | broccoli           | Produce                                            | Reviewer-supplied  | Required before import  |
| 08   | avocado            | Produce                                            | Reviewer-supplied  | Required before import  |
| 09   | banana             | Produce                                            | Reviewer-supplied  | Required before import  |
| 10   | pear               | Produce                                            | Reviewer-supplied  | Required before import  |

The planning buckets make the balanced mix auditable without asserting a
production taxonomy. Qualified category values remain reviewer-supplied. The
bucket does not assert a safety property about a candidate.

## Per-slot dimension applicability

The first five review dimensions are required for every slot. Visual
accessibility and rights is conditional: the qualified packet must mark it
required whenever a visual is required or associated, and must not assume it is
inapplicable merely because the current slot has no visual.

| Slot  | Feeding/developmental | Allergy/restriction | Nutrition/age-stage | Taxonomy/labeling | Storage/handling | Visual accessibility/rights                   |
| ----- | --------------------- | ------------------- | ------------------- | ----------------- | ---------------- | --------------------------------------------- |
| 01–10 | Required              | Required            | Required            | Required          | Required         | Conditional; qualified determination required |

The scenario coverage is therefore a test-plan concern, while the complete
six-dimension applicability and evidence decision remains part of each
qualified review packet.

## Required evidence matrix

For every candidate, the qualified packet must provide the following for each
applicable dimension:

| Dimension                                     | Required evidence                                                                                               | Missing or unsupported evidence |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Feeding safety and developmental suitability  | Qualified authority reference, reviewed decision, source/evidence location, review date                         | Blocks release                  |
| Allergy and restriction metadata              | Qualified authority reference, reviewed decision, source/evidence location, review date                         | Blocks release                  |
| Nutrition and age/stage representation        | Qualified authority reference, reviewed decision, source/evidence location, review date                         | Blocks release                  |
| Taxonomy and labeling                         | Qualified authority reference, reviewed decision, source/evidence location, review date                         | Blocks release                  |
| Storage and handling                          | Explicit qualified support state, authority reference, reviewed decision, source/evidence location, review date | Blocks release                  |
| Visual accessibility and rights (conditional) | Required when a visual is required or associated; rights evidence and usable alt-text/accessibility evidence    | Blocks release when applicable  |

Authority references and evidence locations must be privacy-safe. Do not add
private reviewer names, contact details, medical notes, or caregiver details to
this scope artifact.

## Review-scenario coverage plan

The ten-slot set must exercise these review and lifecycle scenarios. The plan
does not invent a food value or pre-decide a conditional visual requirement.

| Scenario                        | Intended coverage                                                             | Evidence boundary                                                    |
| ------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Complete qualified review       | All 10 slots                                                                  | Qualified packet for every applicable dimension                      |
| Conditional visual review       | Every slot the qualified packet marks as visual-required or visual-associated | Rights and accessibility evidence; no inferred applicability         |
| Missing or unsupported evidence | Controlled negative case during validation                                    | Rejected before import/public visibility; not a production pilot row |
| Re-review and supersession      | At least one correction path when a candidate needs revision                  | Immutable prior evidence plus a new candidate revision               |
| Compatible qualified conflict   | At least one adjudication path when qualified recommendations conflict        | Owner chooses among compatible recommendations only                  |

## Private-pilot opening gate

The pilot may open to the owner and explicitly authorized testers after:

- all 10 candidate packages have stable non-test identifiers;
- every applicable review dimension has complete qualified evidence; and
- no candidate has a domain block, unresolved follow-up, synthetic
  classification, or contradictory lifecycle state.

The private pilot is the phase in which populated workflow, accessibility, and
performance evidence is gathered. A missing opening-gate requirement keeps the
pilot closed or keeps the affected candidate unavailable.

## Expansion and external-release gates

Expansion beyond the private pilot requires all ten foods to pass Foods, Today,
Week, feeding eligibility, planner, and manual meal-planning reads; no
unresolved P0/P1 safety or core-workflow defect; complete qualified evidence;
populated accessibility checks; representative performance evidence; and a
named owner expand-or-stop decision with rollback authority.

External caregiver access remains blocked until the Ticket 18 closed-beta
evidence is complete. Owner convenience, schedule, popularity, or an empty
production catalog cannot waive either gate.

## Explicit non-goals

- This artifact does not add rows to the production seed or catalog.
- It does not create or rewrite safety-critical values.
- It does not approve a candidate, publish a revision, or open external access.
- It does not replace the qualified review packet, Ticket 18 evidence, or the
  controlled publication boundary.
