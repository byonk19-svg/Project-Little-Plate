# Closed-beta gate

This is the evidence index and decision record for Ticket 18. It does not
replace qualified clinical, content, privacy, legal, accessibility, or
operational sign-off.

## Current decision

**NO-GO for external beta.**

The engineering release candidate can be verified with synthetic data, but the
required real-use period, reviewed production catalog, representative mobile
performance measurement, manual assistive-technology audit, and human
approvals are not present. Synthetic fixtures cannot satisfy those gates.

## Evidence index

| Gate                        | Current evidence                                                                                                                                                                                                      | Status                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Repository quality          | `pnpm verify`; Supabase lint/advisors; `git diff --check`                                                                                                                                                             | Run for every candidate and record in the active issue                               |
| Database and isolation      | Full migration reset and integration suite cover RLS, service-role bypass, concurrency, deadlines, content publication, retirement, deletion, and recovery                                                            | Engineering evidence available                                                       |
| Critical mobile workflows   | Full mobile Playwright suite covers onboarding, eligibility, Foods, planning, preparation, serving, expiration, reaction recovery, planner recovery, and deletion                                                     | Engineering evidence available                                                       |
| WCAG 2.2 A/AA automation    | Axe scans signed-out or empty Today, Week, Kitchen, and Foods states at the mobile viewport; the shell suite also checks keyboard activation, visible current state, horizontal overflow, and 44px navigation targets | Limited automated evidence; populated authenticated states are not covered           |
| Manual accessibility        | Keyboard walkthrough beyond the automated shell check, NVDA/TalkBack, 200% zoom, Windows High Contrast, and reduced-motion review                                                                                     | Not recorded                                                                         |
| Today performance           | PRD target is useful authenticated Today content within 1.5 seconds on a representative mobile connection                                                                                                             | Not measured on a representative deployed profile                                    |
| Catalog-search behavior     | Synthetic 60-item mobile browser fixture exercises search and structured filters                                                                                                                                      | Engineering evidence only                                                            |
| Reviewed production catalog | Ticket 17 release report and source checker; `private_dogfood_owner` content is explicitly excluded from the qualified external catalog                                                                               | Blocked on qualified package and approvals                                           |
| Dogfood                     | Ten real-use days across at least two weeks, with de-identified friction classification                                                                                                                               | Not supplied                                                                         |
| Privacy and legal           | Privacy-safe event schema and deletion behavior are automated; human privacy/legal approval remains separate                                                                                                          | Human approval not supplied                                                          |
| Operations                  | Account deletion, emergency retirement, generation disable/enable, backup/restore rehearsal, promotion, and incident runbooks                                                                                         | Rehearse on every candidate; production owners and provider settings remain external |

## Human evidence contract

Record evidence references, not private reviewer details or caregiver notes.
The release owner must supply:

1. dates for at least ten real-use days spanning no fewer than fourteen days;
2. de-identified findings classified by safety impact, workflow impact,
   reproducibility, and release severity;
3. the issue or commit that resolves every P0/P1 finding;
4. qualified content, pediatric feeding, clinician/allergy, privacy, and legal
   approval references;
5. manual accessibility evidence and representative mobile performance
   results;
6. production backup retention, restore ownership, incident ownership, and
   environment-promotion approval; and
7. the named go/no-go owner and decision date.

Do not put exact birthdates, allergy details, reaction descriptions, medical
notes, or private reviewer contact data in this file or the local issue.

## Severity and friction rubric

| Severity | Meaning                                                                                                                                         | Release treatment                                                   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| P0       | Known unsafe recommendation, cross-household disclosure, destructive data corruption, or critical workflow impossible without privileged repair | Immediate no-go; disable the affected path and add regression proof |
| P1       | Reproducible safety-boundary bypass, routine core-loop failure, deletion failure, or inaccessible critical action                               | No-go until resolved and verified                                   |
| P2       | Recoverable workflow defect or significant friction without a known safety-boundary bypass                                                      | Owner and disposition required before go/no-go                      |
| P3       | Lower-impact polish or infrequent recoverable friction                                                                                          | May be accepted only with an owner and explicit rationale           |

Every finding also records workflow, reproducibility, affected environment,
synthetic/non-sensitive evidence reference, and whether refresh/retry/correction
recovers without database intervention.

## Go/no-go ownership and rollback

The external-beta decision belongs to the recorded product/release owner after
all required approvers have signed off. Engineering test results alone cannot
authorize release.

Owner-reviewed `private_dogfood_owner` content is permitted only for the
explicitly authorized private dogfood runtime. It does not satisfy qualified
content, clinical, privacy/legal, accessibility, or external-beta approval.

Stop or roll back the beta when any of these occur:

- an expired, restricted, unpublished, unavailable, saliva-exposed, or
  skill-incompatible recommendation is observed;
- household isolation, deletion, or audit provenance fails;
- routine operation requires privileged database repair;
- a required content revision or source becomes invalid or overdue under the
  recorded policy;
- incident ownership, restore capability, or monitoring is unavailable; or
- a P0/P1 defect or approval withdrawal remains open.

Use the incident runbook to disable automatic generation or retire affected
content. Preserve historical provenance and fall back to manual selection from
currently eligible reviewed content; never bypass safety checks for
availability.
