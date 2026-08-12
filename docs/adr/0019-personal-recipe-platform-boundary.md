# ADR 0019: Personal recipe platform boundary

- Status: Accepted
- Date: 2026-08-11

## Context

Product clarification changed Little Plate from a safety-aware baby meal
operations tool into a private personal recipe and meal-planning tool. The
caregiver wants to enter recipes and save recipe details from other websites,
then manually plan and prepare them.

## Decision

- Today shows the next manually planned personal recipe.
- Week is a seven-day manual plan with one recipe per meal slot.
- Recipes stores private manual/imported recipes with editable fields, source
  attribution, search, tags, favorites, and one optional cover image.
- Kitchen stores preparation status, optional portions, and personal notes.
- Passwordless authentication, household isolation, invite-only access, and
  account deletion remain active.
- URL import is server-side, bounded, JSON-LD-first, and editable. It supports
  single-recipe pages and clearly structured multi-recipe article sections;
  caregivers choose and confirm drafts before saving. Normalized duplicate
  sources are shown as existing recipes and never overwrite caregiver edits;
  separate copies require an explicit choice.
- The app does not make safety, allergen, medical, developmental, serving,
  storage, expiration, nutrition, or feeding-eligibility judgments.

## Consequences

The former catalog, eligibility, reactions, storage, inventory, grocery, and
automatic planner domains remain migration history but must not be active
caregiver surfaces. Recipe text is untrusted personal content and must render
as text, not executable HTML. Uploaded images use a private household-scoped
storage bucket; external images are only stored after explicit approval.
Confirmed images appear on recipe cards when they load, with a text-only
fallback when an external URL is unavailable.

No legacy user data requires preservation, so the schema cutover is additive
and needs no backfill or export.
