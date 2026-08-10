# Personal Recipe Library and Weekly Planning Design

**Status:** approved direction for implementation

## Goal

Give a household a private place to save foods and recipes, import a recipe
from a public HTTPS URL, review the extracted fields, and place personal items
on any day and configured meal slot in the current Week view.

## Safety boundary

Personal recipes are never reviewed Little Plate catalog content. The product
stores caregiver-supplied or source-extracted text without rewriting it into
safety guidance. Personal items are excluded from feeding eligibility, Today,
Kitchen, storage deadlines, serving, and any public catalog read. The UI labels
them `Personal recipe — not reviewed` and explains that Little Plate has not
assessed them.

## Data model

Add household-owned `personal_recipes` records with title, ingredients,
instructions, notes, optional public HTTPS source URL, source type (`manual`
or `recipe_url`), extraction method/status, and timestamps.

Add `personal_planning_items` records linking a recipe to the active baby,
local date, and configured meal slot. These rows are a separate read/write
boundary from reviewed `meal_components`, so existing Today/Kitchen/serving
queries cannot accidentally consume them.

Both tables are household-private through authenticated RLS and controlled
RPCs. Household deletion cascades to both records.

## Recipe-link import

The server accepts only absolute public HTTPS URLs. It rejects localhost,
loopback, private/link-local IP literals, non-HTTPS schemes, redirects to a
non-public URL, oversized responses, non-HTML content, and fetches that exceed
the short timeout. It does not send cookies or credentials.

Extraction uses this order:

1. Recipe JSON-LD, including `@graph` and array forms;
2. standard recipe itemprop markup;
3. title/description metadata as a preview only.

The result is an editable review payload. Nothing is persisted until the
caregiver confirms the fields. A blocked or malformed page returns a clear
error while preserving a manual save path for the URL and notes.

## User flows

- `/recipes` lists household personal recipes and gives actions to import a
  URL or create one manually.
- `/recipes/import` accepts a URL, shows extracted fields, and lets the
  caregiver edit before saving.
- `/recipes/new` creates a manual recipe.
- A recipe detail page displays its source and not-reviewed label and offers a
  Week placement form for any day in the current seven-day window and any
  configured meal slot.
- Week renders personal planning items alongside reviewed meals with a clear
  label. Personal items do not participate in automatic generation, variety
  scoring, Today, Kitchen, storage, or serving actions.

## Failure and lifecycle rules

- Extracted text is never silently treated as complete; missing title,
  ingredients, or instructions remains editable and visibly incomplete.
- Repeating the same save or planning request with an idempotency key is safe.
- A personal recipe can be edited or deleted by household caregivers. Deleting
  a recipe removes its personal planning items but does not touch reviewed
  catalog records or household meal components.
- Personal items remain private and cannot be returned by anonymous catalog or
  external eligibility RPCs.

## Non-goals

- No automatic safety assessment, allergen inference, storage calculation, or
  medical guidance.
- No copying or republishing of third-party recipe pages beyond the fields the
  caregiver chooses to save; the original URL remains the source reference.
- No inventory deduction, refrigerated-batch creation, Today serving, or
  Kitchen work generation for personal items.
