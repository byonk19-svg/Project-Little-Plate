# Audit recovery controls

## Context

The first authenticated browser audit found that Project Little Plate preserves
its safety boundary and renders usable empty states, but several ordinary
recovery paths are missing or misleading:

- a caregiver cannot visibly sign out without deleting the account;
- an existing baby profile cannot be corrected after onboarding;
- Week offers automatic generation when no eligible reviewed preparation is
  available, then returns a generic snapshot error; and
- local passwordless email is captured in Mailpit while the login UI tells the
  developer only to check their email.

The production catalog remains intentionally empty until qualified review.
These changes must improve recovery without introducing, publishing, or
rewriting any safety-critical content.

`CONTEXT.md` is absent at the repository root. This design uses `AGENTS.md`,
the PRD, current issues, ADR 0002, ADR 0014, the live implementation, and the
browser-audit evidence.

## Scope decision

Use four narrow tickets rather than one audit-cleanup change:

1. account session controls;
2. baby-profile editing;
3. actionable planner unavailable states; and
4. local passwordless-email guidance.

The planner and email findings are intentionally separate. They have different
users, configuration boundaries, failure modes, and verification seams.

## Considered approaches

### Selected: extend existing routes and transactional commands

- Put sign-out and profile-management entry points on Account.
- Reuse the existing `complete_baby_profile` transaction for edits.
- Derive planner availability from the same verified Week edit-option read
  model already loaded by the page.
- Render a Mailpit link only from an explicit, validated local-development
  environment value.

This is the smallest approach, preserves current ownership boundaries, and
requires no migration or new dependency.

### Rejected: add a general settings subsystem

A new settings domain, navigation destination, or state-management layer would
create more infrastructure than these four recovery paths need.

### Rejected: populate the production seed for easier dogfood

Synthetic or agent-authored safety content cannot become caregiver guidance.
Full-loop QA must continue to use isolated test fixtures, while production
content remains gated on qualified review.

## Ticket 19: account session controls

Add a calm session section to Account above the destructive deletion section.
It identifies the signed-in session without exposing unnecessary identity
details and provides a visible `Sign out` action.

The server action uses the existing Supabase SSR client and local sign-out
scope. Success redirects to `/login?signedOut=1`; the login page confirms the
session ended. Failure leaves the account page available with an actionable,
non-sensitive error. Signing out never deletes household or baby data.

Protected routes must redirect to Login after sign-out, while a later magic
link restores access to the same household.

## Ticket 20: edit the active baby profile

Account links to an authenticated edit route that loads the one active baby.
The form is the same profile form used during onboarding, with existing
nickname, birth date, IANA time zone, feeding style, and meal slots supplied as
defaults. Copy continues to state that birthday does not establish preparation
eligibility.

Saving reuses the transactional `complete_baby_profile` command. It does not
grant direct table writes, create a second baby, or alter feeding-eligibility,
content, inventory, or historical safety records. Invalid edits leave the
existing profile unchanged. Success returns to Account with confirmation, and
Today/Week render the updated nickname, time zone, and configured slots.

## Ticket 21: actionable planner unavailable states

Week must not offer `Generate a reviewed week` when its verified edit-option
read model has no eligible reviewed preparations. Instead, it renders a clear
unavailable card:

- no plan is generated or partially saved;
- no reason is inferred from unreviewed data;
- the caregiver is told that no eligible reviewed preparation is currently
  available; and
- links lead to Foods and Feeding eligibility as the two safe recovery
  surfaces.

When eligible reviewed options exist, generation and regeneration behavior is
unchanged. Transport/database snapshot failures retain the generic refresh
message because their exact cause is not safely known.

## Ticket 22: local passwordless-email guidance

Add optional `NEXT_PUBLIC_LOCAL_MAIL_URL` configuration. When present, it must
be an absolute loopback HTTP(S) URL. The login success state then explains that
local development captures the one-time link and provides `Open local inbox`.

When the value is absent, production login copy remains unchanged. The app must
never infer a Mailpit address, expose auth tokens, or link to an arbitrary
external host.

`.env.example` and local setup documentation record the optional value.

## Error handling and privacy

- Sign-out failure does not imply that the session ended.
- Profile-save failure does not partially update the baby.
- Planner unavailability never relaxes eligibility or storage rules.
- Local inbox guidance appears only for an explicitly configured loopback URL.
- No analytics event or UI copy includes email, birth date, allergy, reaction,
  or medical details.

## Verification design

Each ticket follows red-green TDD at its narrowest real seam:

- Ticket 19: mobile browser coverage for sign-out, protected-route redirect,
  and preserved account data after a new magic-link login.
- Ticket 20: existing real-Supabase update coverage plus mobile browser
  coverage for prefilled edit, atomic save, refresh, and Week slot/time-zone
  propagation.
- Ticket 21: mobile browser coverage for the clean empty catalog plus regression
  coverage proving synthetic eligible fixtures still expose generation.
- Ticket 22: environment unit tests plus mobile login coverage with and without
  the optional local inbox URL.

Run focused checks and `git diff --check` for each scoped commit. After all four
tickets, run `pnpm verify` once, Supabase lint/advisors if database behavior was
changed, and a final authenticated browser walkthrough.

## Explicit non-goals

- No production catalog records or safety guidance.
- No change to eligibility, storage, allergen, reaction, deadline, or serving
  semantics.
- No caregiver invitations, multiple active babies, password authentication,
  or general settings framework.
- No deployment, push, pull request, or merge.
