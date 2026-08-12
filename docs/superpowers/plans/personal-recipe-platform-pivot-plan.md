# Personal recipe platform pivot implementation plan

Status: executed on `codex/personal-recipe-platform`.

## Product contract

Private passwordless recipe box for one household. Today shows the next
manually planned recipe. Week supports one recipe per slot across seven days.
Recipes supports manual entry, JSON-LD-first public URL import with editable
confirmation, multi-recipe article selection, search, tags, favorites, source
attribution, and one optional cover image. Kitchen supports preparation status,
optional portions, and notes.

Out of scope: safety or eligibility claims, allergen/medical/developmental or
storage guidance, inventory, expiration, groceries, recommendations, automatic
planning, notifications, social features, ratings, and public sharing.

## Execution phases

1. Reconcile active repository guidance and product documentation.
2. Add `recipes`, `recipe_week_slots`, and `prepared_notes` with household RLS,
   ownership-link triggers, constraints, and account-deletion cascades.
3. Add deterministic recipe normalization, manual CRUD, search, tags,
   favorites, and source attribution.
4. Add bounded server-side URL import with scheme/DNS/private-network/
   redirect/body-size/content-type protections, JSON-LD Recipe extraction, and
   clearly structured multi-recipe article extraction.
5. Replace Foods navigation with Recipes and redirect `/foods` compatibility
   traffic. Replace Week and Today with manual recipe planning/read models.
6. Replace Kitchen inventory/storage views with preparation notes.
7. Add a private `recipe-images` bucket, household storage policies, one-cover
   metadata, upload/external URL actions, alt text, and explicit deletion.
8. Replace the active verification gate with recipe CRUD, import, privacy,
   Week/Today, Kitchen, image, accessibility, and mobile browser coverage.

## Verification record

Focused unit tests cover recipe normalization, URL parsing/SSRF boundaries,
Week ordering, prepared notes, and image validation. Supabase reset and recipe
RLS integration coverage are required before handoff. Run the full repository
gate from `AGENTS.md` before merging the branch.

## Remaining cleanup

The legacy migration history can remain for rollback, but old caregiver routes,
old E2E fixtures, and unused legacy module imports should be removed or isolated
after the new mobile browser suite is green.
