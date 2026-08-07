# Request for qualified review: private ten-food pilot

This is a reviewer handoff for Project Little Plate. It asks qualified human
reviewers to complete an existing structured packet. It is not a request to
write new safety guidance from memory, and it is not an approval or publication
record.

## Product scope

The pilot is limited to ten candidate identities already named in the packet:
egg, chicken, black beans, plain yogurt, oatmeal, sweet potato, broccoli,
avocado, banana, and pear.

The product is a baby meal-operations tool for caregivers of approximately
9-15 month old babies. Public catalog content remains unavailable until every
required review gate is complete.

## What we need from reviewers

For each candidate and each applicable dimension, please provide a
privacy-safe, durable record containing:

1. the reviewer role and qualification basis;
2. the source document or authority reference, including version/date and
   relevant section;
3. a deterministic decision: `Accept`, `Accept with clarification`, `Revise`,
   `Block`, `Not applicable`, or `Insufficient evidence`;
4. conditions, exclusions, or follow-up questions in the reviewer's own words;
5. review date and packet version; and
6. an opaque approval reference that can be retained for release audit.

Do not include names, email addresses, credentials, medical records, reaction
histories, caregiver notes, or other private information in the repository
packet.

## Review dimensions and suggested role coverage

| Dimension                                     | Reviewer role needed                                        | Minimum question                                                                                            |
| --------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Feeding safety and developmental suitability  | Qualified pediatric feeding/development reviewer            | Is the candidate's reviewed preparation suitable for the product's target stage and declared skill context? |
| Allergy and restriction metadata              | Qualified clinical allergy reviewer                         | Are the allergen and restriction fields complete, source-backed, and appropriately bounded?                 |
| Nutrition and age/stage representation        | Qualified pediatric nutrition reviewer                      | Are the candidate's nutrition and stage representations accurate and non-medical in scope?                  |
| Taxonomy and labeling                         | Qualified food-identity/content reviewer                    | Does the stable identity and labeling match the reviewed candidate without unsafe normalization?            |
| Storage and handling                          | Qualified food-safety reviewer                              | Is the selected storage/handling evidence applicable to this preparation and lifecycle?                     |
| Visual accessibility and rights (conditional) | Accessibility reviewer and separate rights/permission owner | If a visual is used, is its alternative equivalent and is its use authorized?                               |

One person may cover multiple dimensions only when their role and scope are
explicitly documented. A repository owner may adjudicate implementation choices,
but cannot replace a required qualified domain decision.

## Evidence starting points

The project has prepared a non-approval source map at
`docs/research/2026-08-06-private-pilot-evidence-map.md`. It links public
primary sources from CDC, WHO, FDA, FoodSafety.gov, USDA FoodData Central, and
W3C. Reviewers may use other authoritative sources, but every decision must
identify the exact source and applicability.

## Public ways to find a reviewer

You do not need a personal referral. These official directories and expert
channels are reasonable starting points for a short, paid or volunteer review
request:

- [Academy of Nutrition and Dietetics: Find a Nutrition Expert](https://www.eatright.org/find-a-nutrition-expert)
  for a registered dietitian nutritionist with pediatric experience.
- [AAAAI: Tools for the Public](https://www.aaaai.org/tools-for-the-public)
  for the allergist/immunologist directory.
- [ASHA ProFind](https://www.asha.org/profind/) for a speech-language
  pathologist with pediatric feeding/swallowing experience.
- [USDA FSIS Meat and Poultry Hotline](https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/usda-meat-and-poultry-hotline)
  or [askFSIS](https://www.fsis.usda.gov/contact-us/askfsis) for food-safety
  questions involving meat, poultry, or egg products.

Ask whether the person is willing to review a small, source-backed product
packet, what scope they can cover, and what fee or arrangement they require.
Do not send private caregiver or child information. A directory listing or
informal answer is not itself an approval; the reviewer must complete the
structured packet and provide the durable authority reference it requires.

## Files to complete

- `docs/catalog-review/private-pilot-review-packet.md`
- `docs/catalog-review/reviewer-authority.template.md`
- the structured schemas in `docs/catalog-review/`

Use `Insufficient evidence` or `Block` when the evidence is missing or does not
apply. Do not fill blanks with guessed preparation, allergen, nutrition,
storage, medical, or visual-rights values.

## Release boundary

The engineering import and publication gates will run only after the completed
packet is returned and validated. Until then, the production catalog stays
empty and parent-facing reads remain fail-closed. A completed review packet
does not automatically publish anything; it is an input to the controlled
Ticket 25 workflow.
