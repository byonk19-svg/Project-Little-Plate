# Little Plate Recipes context

This glossary records the active product language after the personal recipe
platform pivot. The old reviewed-food vocabulary remains historical only.

## Product contract

- Today shows the next recipe the caregiver manually planned.
- Week is a seven-day manual plan with one recipe per meal slot.
- Recipes stores private manual and imported recipes.
- Kitchen stores lightweight preparation notes.
- The product does not make safety, allergen, medical, developmental, serving,
  storage, expiration, or nutrition judgments.

## Language

**Personal recipe**:
A private recipe record entered by the caregiver or imported from an external
recipe URL. It is an organization and planning aid, not approved guidance.

**Recipe import**:
A best-effort server-side capture of public recipe information. It supports
single-recipe pages and articles with multiple clearly structured recipe
sections. The caregiver chooses, edits, and confirms the extracted fields
before recipes are saved.

**Duplicate import**:
An import whose normalized source URL already belongs to a recipe in the same
private household. The default outcome is to show the existing recipe, while
the caregiver may explicitly choose to save a separate copy.

**Normalized source URL**:
A source URL compared without scheme differences, a trailing slash, or common
tracking parameters such as `utm_*`; distinct page paths remain distinct.

**Mixed import result**:
A multi-recipe import containing both new recipes and duplicate imports. New
recipes are selected by default; existing matches are marked, unselected, and
offer open-existing or explicit separate-copy actions.

**Import preservation**:
Re-importing a matching source never overwrites the existing recipe or its
caregiver edits. Refreshing source content requires an explicit separate copy.

When multiple saved copies match, the import review shows the existing copies
as choices to open, keeps the new import unselected, and still permits an
explicit separate copy.

**Prepared note**:
A caregiver-owned record of preparation status, optional portions, and notes.
It is not inventory and does not contain an app-calculated deadline.

**Recipe image**:
One optional cover image per recipe, supplied by caregiver upload or an
approved external URL. An image detected during import is only a suggestion
until the caregiver explicitly confirms it. Uploads are private; external URLs
are never copied automatically.

**Recipe card**:
A recipe-list summary that shows the confirmed cover image when available and
falls back to the text-only layout when no image is present.

**Imported image suggestion**:
An image detected from a source page and shown during review with an unchecked
confirmation control. It becomes a confirmed external cover image only when
the caregiver selects it.

**Image fallback**:
When a confirmed external image cannot load, the recipe remains usable and
falls back to the text-only card layout. The caregiver can replace or remove
the image from recipe details.

**Private household**:
Recipes, plans, preparation notes, and image metadata are isolated by the
existing authenticated household relationship and account deletion boundary.

## Legacy boundary

The former catalog, feeding eligibility, reactions, storage deadlines,
expiration, grocery, automatic planner, and reviewed-content release terms are
legacy implementation history. They must not reappear in the caregiver UI or be
used as the source of new recipe decisions.
