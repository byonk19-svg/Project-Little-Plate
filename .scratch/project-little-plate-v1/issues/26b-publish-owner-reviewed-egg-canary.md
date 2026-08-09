# 26B - Publish the first owner-reviewed egg canary

**Status:** private canary published; parent workflow remains to be exercised

This slice moves one explicitly approved, private-dogfood egg preparation
through the existing candidate-import, owner-approval, and private-publication
boundaries. It does not add qualified external review, public visibility, seed
data, or a second food.

## Approved content

- Food: `Egg` (`protein`)
- Preparation: `Soft scrambled egg`
- Parent-facing wording: `Cook the egg until the white and yolk are firm and
  the egg reaches 160°F. Cut into soft, small pieces.`
- Required skill tag: `Soft small pieces`
- Allergen tag: `Egg`
- Visual requirement: `false`
- Preparation-time band: `under_15_minutes` as a convenience band, not a
  safety claim
- Storage support: supported for an unserved cooked batch; refrigerate within
  2 hours at 40°F or below and apply the conservative 72-hour endpoint from
  the cited 3-to-4-day source range. Unknown timing remains unavailable.

The complete candidate envelope is versioned at
`docs/catalog-review/approved-private-dogfood/egg-soft-scrambled-v1.json`.

## Evidence and authority

The owner approved this private-dogfood package in the parent task on
2026-08-09. The package records only the product-owner private standard; it is
not qualified external review and cannot satisfy the external release gate.
Source records are CDC developmental/texture guidance, USDA FSIS egg cooking
and storage guidance, and FDA major-allergen labeling vocabulary. The FSIS page
returned HTTP 403 to the local automated source probe, but its official content
was independently verified during research; this is recorded as a source-fetch
limitation, not replaced with an invented value.

## Acceptance evidence

- [x] Candidate import accepted with digest
  `sha256:216f6b6d8c7f8e1cde855a3c601a93ad01d4924f41ee0f599541cd29fec69c0a`;
  exact replay returned the same receipt.
- [x] Owner approval accepted with `reviewer_role=product_owner`; exact replay
  returned `replayed=true`; mismatched replay was rejected with HTTP 400.
- [x] Private publication accepted with
  `publication-egg-soft-scrambled-v1`; exact replay returned `replayed=true`;
  mismatched replay was rejected with HTTP 400.
- [x] Anonymous hosted Foods/catalog count is `0`, legacy preparation count is
  `0`, and anonymous detail is `null`.
- [x] A temporary authenticated Supabase user saw exactly one catalog item and
  one legacy preparation; detail returned only the approved egg revision.
  The temporary user was deleted after the read check.
- [x] Hosted `get_catalog_review_eligibility` remains
  `eligible=false` with `private_dogfood_owner_not_external`.
- [x] Hosted rows confirm one `food-egg` record and one
  `private_dogfood_owner` publication; no seed or anonymous publication was
  created.
- [ ] Hosted source checks, Foods, Week, Kitchen, Today, and storage lifecycle
  are verified after publication.

## Non-goals

- No qualified external publication.
- No public anonymous catalog visibility.
- No second food, UI redesign, schema expansion, or reviewer-console work.
- No individualized medical, allergy-reaction, portion, or serving advice.
