# 24 — Record the ten-food private-pilot scope

**What to build:** Record the exact private-pilot scope as a reviewable
manifest and evidence matrix, so the release has ten bounded slots and every
applicable review dimension has a clear qualified-evidence requirement without
inventing food values or reviewer identity data.

**Blocked by:** None — can start immediately

**Status:** completed

- [x] The manifest records exactly 10 pilot slots, auditable planning buckets
      for a balanced mix, and the review-scenario coverage required for the
      pilot without asserting production taxonomy.
- [x] Each slot identifies all five always-required review dimensions and
      marks conditional visual accessibility/rights review when applicable.
- [x] The manifest requires privacy-safe qualified authority references and
      evidence locations for every applicable dimension.
- [x] Missing source, storage, allergen/developmental, or applicable visual
      rights/alt-text evidence is represented as blocked; no owner waiver is
      available.
- [x] The artifact contains no invented preparation, serving, allergen,
      storage, medical, or visual-rights guidance and no private reviewer
      details.
- [x] The manifest explicitly labels the release private to the owner and
      authorized testers and keeps external access blocked by Ticket 18.
- [x] Documentation and whitespace checks pass, and the local issue records
      decisions, evidence, and unresolved human-input risks.

## Implementation evidence

- Scope artifact: `docs/catalog-review/private-pilot-scope.md`.
- The artifact records exactly ten existing PRD identity targets as candidate
  slots only, with planning buckets distinct from qualified production
  taxonomy; it does not approve or publish any candidate.
- Category values, qualified authority references, evidence locations, and all
  safety-sensitive review decisions remain reviewer-supplied. Missing evidence
  is explicitly fail-closed.
- Private visibility and the Ticket 18 external-release block are explicit.
- `pnpm exec prettier --check .scratch/project-little-plate-v1/23e-content-scope-spec.md .scratch/project-little-plate-v1/issues/24-record-ten-food-pilot-scope.md .scratch/project-little-plate-v1/issues/25-import-and-qualify-private-pilot-package.md .scratch/project-little-plate-v1/issues/26-run-private-pilot-release-gate.md docs/catalog-review/private-pilot-scope.md` — passed.
- `git diff --check` — passed.

## Remaining risks

- No qualified ten-food package has been supplied or imported yet.
- No production seed or public catalog rows are authorized by this ticket.
- Ticket 25 remains blocked until qualified candidate and review evidence is
  available; Ticket 26 remains blocked by Ticket 25 and Ticket 18.
