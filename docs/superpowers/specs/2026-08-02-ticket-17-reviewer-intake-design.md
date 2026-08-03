# Ticket 17 catalog review intake design

## Goal

Give qualified reviewers an evidence-based inventory of the current
repository catalog and a structured form for separate feeding safety and
developmental suitability, allergy and restriction metadata, nutrition and
age/stage representation, taxonomy and labeling, storage and handling, and
conditional visual accessibility and rights review.

## Boundaries

- Extract existing values verbatim; do not invent, approve, or rewrite safety
  content.
- Clearly distinguish empty production/seed state from synthetic test fixtures.
- Reviewers provide qualified domain recommendations. The repository owner
  adjudicates implementation choices and implements accepted changes, but
  owner adjudication cannot override or replace required qualified domain
  review.
- Do not change migrations, seed data, app behavior, or production values.

## Artifacts

`README.md`, `current-catalog-inventory.md`,
`catalog-review-form.template.md`, `catalog-review.schema.json`, and
`missing-data-and-provenance.md`. The old first-ten tracker is removed because
no launch-food scope is established by this task. The package JSON remains only
as an optional post-review import shape.
