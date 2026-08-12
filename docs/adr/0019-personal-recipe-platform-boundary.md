# ADR 0019: Personal recipe platform boundary

- Status: Accepted
- Date: 2026-08-11
- Scope: Product direction after repository audit and product clarification

## Context

The repository was built as a safety-aware baby meal operations tool with a
reviewed catalog, feeding eligibility, storage deadlines, inventory, reactions,
and deterministic planning. Product clarification changed the intended website:
it should be a private personal recipe and meal-planning tool for one caregiver
and one baby, with recipes entered manually or imported from other websites.

The caregiver wants to use personal judgment. The product therefore must not
present personal or scraped recipe content as approved feeding, allergen,
storage, medical, or developmental guidance. Keeping the old claims while
removing their governing content boundary would be misleading and unsafe.

## Decision

- Make Today a view of the next planned personal recipe, not an automatic food
  recommendation.
- Make Week a seven-day manual plan with one personal recipe per meal slot.
- Make Recipes the primary content surface for manually entered and imported
  personal recipes, with source attribution, editing, search, tags, favorites,
  and optional images.
- Make Kitchen a lightweight preparation log with status, optional portions,
  and caregiver notes only.
- Keep passwordless authentication, private household ownership, and invite-only
  pilot access.
- Import recipe text as editable personal content after caregiver confirmation.
  URL import must be best effort, server-side, bounded, and protected against
  SSRF, redirects to private networks, oversized responses, and unsafe markup.
- Support recipe images through caregiver upload, caregiver-approved URLs, and
  confirmed import suggestions with source, rights, and alternative-text fields.
- Remove from the caregiver product: reviewed catalog publication, feeding
  eligibility, reaction workflows, storage deadlines, expiration claims, full
  pantry inventory, grocery lists, automatic week generation, notifications,
  social features, ratings, and public sharing.

## Consequences

- The existing catalog, eligibility, storage, reaction, derived-grocery, and
  planner domains become legacy implementation that must be retired or isolated
  behind no user-facing routes.
- The new core domain is smaller: `Recipe`, `RecipeImport`, `RecipeImage`,
  `WeekSlot`, and `PreparedNote`.
- Existing account privacy and deletion controls remain valuable and should be
  reused.
- Existing production data is intentionally empty, so the implementation can
  use an additive migration and a clean product cutover without backfilling
  legacy reviewed-content records.
- Scraped recipe content and images remain user-owned reference material. The
  product must preserve source attribution and must not imply that source
  content has been reviewed by the product.

## Reversal conditions

Revisit this decision only if the product intentionally returns to making
feeding, serving, allergen, storage, or developmental claims. That would
require restoring an explicit reviewed-content and qualified-review boundary
before those claims re-enter the caregiver experience.
