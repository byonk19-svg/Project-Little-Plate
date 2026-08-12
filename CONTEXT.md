# Project Little Plate context

This glossary records the product terms that shape reviewed catalog releases.
It stays separate from implementation details and safety guidance.

## Language

**Pilot release**:
A deliberately small first private-pilot catalog containing exactly 10 foods,
each supported by the complete qualified review and provenance required by the
release boundary. It is a validation release, not the eventual 40–60-food
catalog target.
_Avoid_: launch catalog, sample content, demo foods

**Balanced pilot mix**:
A pilot selection spread across the approved food categories and review
scenarios needed to exercise taxonomy, allergen, storage, preparation, and
conditional visual review. The mix is chosen for coverage, not popularity.
_Avoid_: popularity list, representative sample by assumption

**Role-based approval coverage**:
The pilot must identify qualified authority for every applicable review
dimension and retain only privacy-safe authority references and evidence
locations. A missing or unsupported role does not become an owner decision or
an inferred approval.
_Avoid_: named reviewer roster, owner approval as safety review

**Fail-closed pilot release**:
A pilot food is unavailable to public reads until every applicable review,
source, storage, and conditional visual-rights requirement has complete,
qualified evidence. Convenience, schedule, or owner preference cannot waive a
missing requirement.
_Avoid_: provisional publication, owner override, soft launch exception

**Private pilot**:
The first 10-food release is visible only to the owner and explicitly
authorized testers while content, workflow behavior, accessibility, and
performance evidence are gathered. It is not an external beta or public launch.
_Avoid_: public beta, open launch, production-by-default

**Pilot expansion gates**:
The private pilot can expand only after all 10 foods pass the parent-facing
read paths, no P0/P1 safety or core-workflow defect remains, qualified review
evidence is complete, populated accessibility and performance checks pass, and
the owner records an explicit expand/stop decision.
_Avoid_: time-based launch, green CI as the only release gate

**External release gate**:
External caregiver access remains blocked until the closed-beta evidence is
complete: real dogfood, qualified content/clinical approvals, privacy/legal
review, populated accessibility and representative performance evidence, and a
named go/no-go owner with rollback authority.
_Avoid_: public beta by schedule, synthetic evidence as a substitute, anonymous
go/no-go ownership

**Personal recipe**:
A household-owned food or recipe record supplied by a caregiver or imported
from a public recipe URL. It is planning content, not reviewed Little Plate
catalog content, and never makes a safety, storage, or feeding-eligibility
claim.
_Avoid_: reviewed preparation, approved food, public catalog item.

**Personal planning item**:
A personal recipe placed on a household baby's weekly day and meal slot. It is
visible to household caregivers in Week, carries a not-reviewed label, and is
excluded from Today, Kitchen, serving, storage, and eligibility decisions.
_Avoid_: meal component, eligible preparation, recommendation.

## Current product direction

The product direction is now a private personal recipe and meal-planning tool.
The former reviewed-catalog terms above describe legacy product work that is
being retired from the caregiver experience; they do not define the new
recipe-box behavior.

**Personal recipe**:
A private recipe record entered by the caregiver or imported from an external
recipe URL. It is an organization and planning aid, not a claim that the
recipe is safe, suitable, reviewed, or medically appropriate.
_Avoid_: approved recipe, safe recipe, reviewed preparation

**Recipe import**:
A best-effort capture of recipe information from a caregiver-supplied URL. The
caregiver reviews and edits the extracted title, ingredients, instructions,
timing, servings, and source attribution before saving it.
_Avoid_: automatic approval, authoritative recipe conversion

**Prepared note**:
A caregiver-owned record of preparation status, optional portion count, and
personal notes for a planned recipe. It does not contain an app-calculated
storage deadline or expiration judgment.
_Avoid_: inventory, safe portion, validated batch

**Recipe image**:
A caregiver-uploaded image, caregiver-approved image URL, or explicitly
confirmed import suggestion stored with source, rights, and alternative-text
metadata. External images are not copied or displayed automatically merely
because a page contains them.
_Avoid_: licensed-by-default image, scraped asset

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
