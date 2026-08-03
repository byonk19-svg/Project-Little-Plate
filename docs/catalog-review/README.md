# Catalog review intake packet

This packet is for qualified reviewers inspecting the values that already
exist in this repository. It is not a catalog-authoring request and it is not
an approval or release record.

## Current state

The committed production path is intentionally empty: `supabase/seed.sql`
contains no foods, preparations, revisions, sources, or safety fixtures.
The inventory therefore includes synthetic records embedded in integration
and browser tests, clearly labeled as test-only. Synthetic values must not be
copied into production or treated as evidence.

Start with [current-catalog-inventory.md](./current-catalog-inventory.md).
Reviewers should evaluate the existing value verbatim, its repository path and
stable identifier, and the provenance gaps recorded there. Do not infer or
rewrite feeding, allergen, nutrition, developmental, preparation, or storage
guidance.

## Reviewer roles and workflow

The packet names required reviewer roles but leaves identity and approval
references blank. Reviewers provide domain recommendations; they do not edit
code, migrations, seed data, or repository records. The repository owner
adjudicates conflicting recommendations, implements accepted changes, and
records the final approval evidence.

For each applicable record, copy the entry in
`catalog-review-form.template.md` (or use `catalog-review.schema.json`) and
review these dimensions separately:

1. Feeding safety and developmental suitability: shape, size, texture,
   consistency, preparation, skill assumptions, choking or serving concerns.
2. Allergy and restriction metadata: major allergens, ambiguity or
   cross-contact, restriction tags, and misleading omissions.
3. Nutrition and age/stage representation: claims or implications, stage
   language, portion/frequency implications, and unsupported assumptions.
4. Taxonomy and labeling: food/preparation names, tags, categories, duplicates,
   overlap, and caregiver-facing clarity.
5. Storage and handling: storage support, refrigeration/freezing, duration
   claims, reheating/serving-after-storage implications, and explicit
   unsupported or unknown states.
6. Visual accessibility and rights, when a visual exists or is required:
   visual reference, rights/license evidence, and alt text.

Use one of: `Accept`, `Accept with clarification`, `Revise`, `Block`, `Not
applicable`, or `Insufficient evidence`. Unknown values stay unknown. A source
URL, blog, product page, or generated text is not automatically authoritative;
the reviewer must identify the evidence and the qualification basis.

`Accept with clarification` is release-eligible only when no catalog value
changes, the clarification is recorded, follow-up is resolved, and the
qualified reviewer marks it non-blocking. Any wording, metadata, preparation,
storage, allergen, developmental, nutrition, labeling, or visual change
requires a new candidate revision and new qualified review.

Do not store private contact information, credentials, birthdates, medical
notes, reaction histories, or caregiver notes. Do not treat a completed form as
publication authority. The release/repository owner may adjudicate
implementation choices between otherwise qualified recommendations, decline
release, or return content for revision. The owner may not clear `Block`,
`Insufficient evidence`, `Revise`, or unresolved follow-up by owner decision
alone. A domain block can only be cleared by a later qualified submission for
the same dimension. Owner adjudication never substitutes for feeding,
dietitian, allergy/clinical, storage, nutrition, or visual-rights authority.

The optional `catalog-package.template.json` is only a
post-review import shape; it is not the review packet and must not be imported
as-is.
