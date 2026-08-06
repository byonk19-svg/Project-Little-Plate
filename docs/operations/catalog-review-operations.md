# Catalog review operations

This document is the operating guide for the repository owner and qualified
reviewers who move a reviewed catalog candidate through the production release
boundary. It describes how to record decisions and preserve evidence. It does
not provide feeding, allergen, nutrition, preparation, storage, medical, or
visual-rights guidance; those values must come from qualified, source-backed
review.

## Roles and authority

### Qualified reviewers

Qualified reviewers review only the dimensions covered by their recorded
authority. For each dimension they provide:

- a decision from the packet's controlled vocabulary;
- the reviewer role and authority reference;
- the review date;
- evidence references for the claims reviewed;
- storage context when the dimension is `storage_handling`; and
- visual context when `visual_accessibility_rights` applies.

Reviewers provide domain recommendations. They do not edit repository records,
choose a conflicting recommendation on behalf of the owner, publish content,
retire content, or store private contact, medical, caregiver, or identity
details in the packet.

### Repository/release owner

The owner operates the controlled service-role RPCs, records implementation
decisions, and adjudicates implementation choices between otherwise qualified,
eligible recommendations. Owner adjudication must select an exact current
qualified submission, record a compatible conflict without selecting one, or
explicitly return/decline the release.

Owner adjudication cannot clear a qualified `Block`, `Revise`, `Insufficient
evidence`, unresolved follow-up, or a missing authority/evidence requirement.
It cannot replace qualified domain review. A domain block is cleared only by a
later qualified submission for the same dimension and review lineage.

## Durable records

The review boundary is append-only. Keep these records together for the case
and revision under review:

| Record                                    | Operational meaning                                                                                                                          |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Reviewer authority and covered dimensions | Which qualified role may review which dimension, with its evidence location and validity window.                                             |
| Review case and case events               | One lifecycle record for one candidate revision plus every status transition and reason.                                                     |
| Review submission                         | One immutable, dimension-specific recommendation. A later round links with `supersedes_submission_id`; it does not edit the predecessor.     |
| Submission evidence                       | The claim, evidence reference, optional catalog source ID, and timestamp supporting a submission.                                            |
| Owner adjudication                        | One append-only decision per case/dimension chain. A successor must supersede the current adjudication tip.                                  |
| Publication proof and retirement event    | The exact release evidence and any later retirement. Historical proofs remain stored but an invalid latest proof cannot revive an older one. |

Stable IDs, revision IDs, authority references, dates, decisions, evidence
references, supersession links, adjudication notes, implementation references,
and case-event reasons are audit data. Preserve them when a later review or
release changes the effective outcome.

## Case lifecycle

Use the controlled transition RPC with a non-empty reason. The legal lifecycle
is:

```text
draft -> ready_for_review -> in_review
in_review -> changes_requested | blocked | completed
changes_requested -> in_review | blocked
blocked -> in_review
```

`completed` is a review outcome, not publication. A case can complete only when
the eligibility report is true. Publication is a separate controlled RPC that
creates an immutable proof and changes the reviewed catalog revision through
the publication boundary.

### Start a case

1. Import a candidate package through
   `import_catalog_candidate_package`.
2. Confirm the package is classified as `production_candidate` and that the
   case is linked to the intended revision.
3. Move the case from `draft` to `ready_for_review`, then to `in_review`.

Candidate packages must not contain owner adjudications, publication status,
approval dates, retirement events, or catalog mutations. Rejected fields remain
rejections; they are not silently ignored.

### Record a review round

Import the qualified review packet through
`import_catalog_review_packet`. Every submission must identify its case,
revision, dimension, authority, review date, decision, and evidence. A later
submission for a dimension must explicitly supersede the current submission
tip. Never update or delete a prior submission or its evidence.

Use the latest unsuperseded qualified submission for the effective review. A
stale submission may remain in history, but it cannot make a case eligible or
be selected by a later adjudication.

## Decision handling

Use the packet vocabulary exactly:

| Decision/outcome                                     | Required operation                                                                                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `Accept`                                             | Keep the review tip effective; it still needs valid authority, evidence, and all other dimensions.                                           |
| `Accept with clarification`                          | Eligible only when the clarification is non-blocking, follow-up is resolved, and no catalog value changes.                                   |
| `Revise` or clarification requiring a catalog change | Move to `changes_requested`; create a new candidate revision for any value change and repeat qualified review.                               |
| `Block`                                              | Move to `blocked` only when the current blocker has qualified authority and evidence. Owner notes cannot override it.                        |
| `Insufficient evidence`                              | Remains unavailable; obtain qualified evidence or return for revision.                                                                       |
| `Not applicable`                                     | Use only when the reviewed record and release rules establish that the dimension does not apply. Do not use it to skip a required dimension. |
| `select_qualified_recommendation`                    | Owner adjudication selects one exact current eligible submission for a compatible conflict.                                                  |
| `record_compatible_conflict`                         | Record the conflict without selecting a recommendation; the case remains unavailable until resolved.                                         |
| `return_for_revision`                                | Return the case for a new candidate/review round; no publication follows.                                                                    |
| `decline_release`                                    | End the release attempt while retaining the complete history.                                                                                |

The eligibility report is the decision point. Do not infer eligibility from a
row count, an owner note, a reviewer URL, or a prior approved revision.

## Conflict resolution

When two or more current submissions for one dimension are qualified and
compatible:

1. Verify that each submission is still a current tip, has valid authority for
   the dimension, has evidence, and is otherwise eligible.
2. Record the owner's reasoning and implementation reference through
   `record_catalog_owner_adjudication`.
3. For `select_qualified_recommendation`, select the exact submission ID. The
   RPC rejects a stale, superseded, unqualified, or dimension-mismatched ID.
4. If the conflict cannot be resolved without changing a catalog value, use
   `return_for_revision` or `decline_release`; do not choose by convenience.

Adjudications form their own append-only chain. Create one root per case and
dimension, then supersede only the current tip. A stale selection remains
invalid even if it was once correct.

## Re-review and blocked cases

Re-review preserves the original case, revision, submissions, evidence, and
events. Add a new qualified submission that explicitly supersedes the prior
dimension tip when the reviewed value remains on the same revision. If the
reviewed catalog value changes, leave the old case/revision as historical and
create a new candidate revision and review case instead of changing an
approved or reviewed snapshot.

Entering `blocked` requires a current qualified `Block` with evidence. Leaving
`blocked` requires a later qualified clearing submission for every current
blocker in the same dimension and lineage. The clearing decision may be
`Accept` or a non-blocking, resolved `Accept with clarification` that does not
change a catalog value. The owner cannot reopen a blocked case by adjudication
alone; the only legal transition is `blocked -> in_review` after those clearing
submissions exist.

If any blocker remains current, or a clearing submission lacks authority,
evidence, or resolved follow-up, keep the case blocked and fail closed.

## Retirement and overdue review

Retirement is an append-only event against the reviewed revision. It does not
delete the revision, publication proof, submissions, evidence, or case events.
Record the retirement reason and date through the controlled operational path,
using `node scripts/run-operator-action.mjs retire-content` with a protected
service-role environment, incident reference, and bounded reason.

When an approved publication reaches its next-review date, do not extend the
date casually or rewrite the old proof. The release owner records the chosen
disposition in the release issue: qualified re-review, or retirement. Until a
new proof is valid, the public read boundary returns no record. If a successor
publication is expired or retired, historical predecessors remain history only
and cannot re-enter Foods, Today, Week, planner, feeding eligibility, or manual
meal planning.

## Publication handoff

Before calling `publish_catalog_review_case`:

1. Run `get_catalog_review_eligibility` for the exact case and retain the
   machine-readable result.
2. Confirm every required dimension, authority, evidence reference, storage
   support state, and conditional visual review is present.
3. Confirm the revision is a completed production candidate, not synthetic,
   retired, or overdue. An already published request is allowed only when the
   publication RPC receives the exact same proof and date arguments for an
   idempotent replay; a different proof must be rejected.
4. Record the release-owner decision reference and source-validation reference.
5. Call the controlled publication RPC with the exact approved and next-review
   dates. Repeating the same request must be an exact idempotent replay.

Never insert or update publication proofs directly. Never use a session setting,
request metadata, or caller-supplied flag as evidence of internal authority.
Public reads must consume the authoritative current-publication boundary.

## Evidence retention checklist

For each release or declined release, retain:

- candidate package ID, version, digest, and source records;
- case ID, revision ID, lifecycle events, transition reasons, and final status;
- reviewer authority references and covered dimensions;
- every submission, supersession link, decision, review date, and evidence row;
- owner adjudication chain, exact selected submission IDs, notes, and
  implementation references;
- eligibility output and rejection reasons at the release decision point;
- publication proof, source-validation reference, approved/next-review dates,
  and any retirement event; and
- the release issue's rejected-record list and remaining risks.

Do not retain private reviewer contact details, credentials, birthdates,
medical notes, reaction histories, or caregiver notes in these records. A missing
or unsupported evidence field is a fail-closed result, not a prompt to fill in
the value from general knowledge.

## Operational stop conditions

Stop the release and record the reason when:

- a required dimension has no current qualified submission;
- authority is missing, outside its validity window, or does not cover the
  dimension;
- evidence is missing or its source validation fails;
- a blocker, unresolved follow-up, required clarification, or invalid
  adjudication remains;
- the candidate is synthetic, the revision is retired, or the proof is overdue;
- a public read would require falling back to a historical proof; or
- the package asks an owner or automation to supply safety-critical guidance.

The production catalog remains empty and all candidate fixtures remain
non-public until a separately authorized content-scope decision and qualified
review are complete.
