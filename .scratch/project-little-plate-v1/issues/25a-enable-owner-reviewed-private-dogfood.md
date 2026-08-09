# 25A - Enable owner-reviewed private dogfood content

**What to build:** Add a narrowly scoped private-owner content standard so the
owner can test the private dogfood app with source-backed, explicitly approved
content without representing that content as independently qualified for
external release.

**Blocked by:** none

**Status:** ready-for-review

## Safety and policy boundary

- `private_dogfood_owner` is valid only for the private owner dogfood runtime.
- Candidate values must still carry attributable sources and explicit storage,
  visual, taxonomy, and preparation metadata; unsupported values remain
  unsupported rather than being inferred.
- AI/Codex may prepare a source-backed draft, but cannot mark it owner-approved
  or qualified. The owner approval is a separate controlled operation.
- Owner-reviewed content must carry `review_standard = private_dogfood_owner`
  and `reviewer_role = product_owner`.
- Qualified external publication remains a separate standard and still requires
  the complete applicable qualified review evidence.

## Acceptance criteria

- [x] A draft candidate can receive an immutable owner approval with an opaque
      approval reference and valid review/approval/next-review dates.
- [x] Owner approval requires source, storage, visual-declaration,
      preparation-time, skill-tag, and allergen-tag evidence already present in
      the candidate; missing support stays explicitly unsupported.
- [x] A separate controlled private-publication RPC publishes only an approved
      `private_dogfood_owner` revision and is idempotent for the exact proof.
- [x] Private publications are visible to authenticated private-dogfood reads,
      but not anonymous reads or the qualified external publication path.
- [x] Foods, Today, Week, feeding eligibility, planner, Kitchen, and manual
      meal planning inherit the same private publication boundary.
- [x] `get_catalog_review_eligibility` and the Ticket 18 external-beta gate
      explicitly reject owner-only content as qualified external evidence.
- [x] Existing immutable revisions, source provenance, storage deadlines,
      retirement, RLS, and publication fail-closed behavior remain intact.
- [x] No reviewer UI, production seed data, hosted data, or real food values
      are added in this ticket.

## Planned validation

- Focused owner-publication integration tests, including anonymous versus
  authenticated visibility, qualified-path rejection, and idempotent replay.
- Existing unit, lint, typecheck, build, database reset, integration, E2E, and
  whitespace checks as locally available.
- Independent review of the policy split and the new SQL boundary.

## Remaining risks

- Hosted 26A non-allowlisted email verification remains an external blocker and
  is intentionally not changed here.
- No real food is imported until this policy path is verified and the owner
  supplies an explicit source-backed approval for the first canary.

## Implementation evidence

- Added migration `20260808120000_owner_reviewed_private_dogfood.sql` with the
  explicit `private_dogfood_owner` standard, append-only owner approvals,
  idempotent approval/publication RPCs, qualified-path rejection, and
  authenticated-only private reads.
- Added synthetic-only integration coverage in
  `tests/integration/private-dogfood-publication.test.ts`; it proves owner
  approval, private publication, anonymous hiding, authenticated visibility,
  qualified eligibility rejection, and qualified-publication rejection.
- Updated ADRs and catalog operations/release docs to keep private owner
  dogfood separate from qualified external release. No reviewer UI, seed data,
  hosted data, or real food content changed.
- Independent security/spec rereview returned `READY`. Its two findings were
  corrected before publication: caller-visible publications are ranked before
  validity filtering, so a private successor cannot hide an older qualified
  read from anonymous callers; and an owner approval row makes external
  eligibility false before the private publication step as well as after it.

## Validation evidence

- `pnpm format:check` — passed.
- `pnpm lint` — passed.
- `pnpm typecheck` — passed.
- `pnpm test` — 18 files, 137 tests passed.
- `pnpm test:catalog-sources` — 6 tests passed.
- `pnpm build` — passed.
- Focused private-dogfood integration test — 1 test passed.
- `pnpm test:integration` — 13 files, 92 tests passed.
- `pnpm test:e2e` — 19 Playwright tests passed.
- `pnpm verify:database` — passed (clean local reset and restart).
- `npx --yes supabase@latest db lint --local` — passed; no schema errors.
- Independent owner-dogfood security/spec rereview — `READY`, no remaining
  blocking findings.
- Local `inspect db advisors` is not provided by the installed Supabase CLI;
  no advisor result is claimed.
- `git diff --check` and repository whitespace checks — passed on the current
  diff; rerun before any commit/publication.
