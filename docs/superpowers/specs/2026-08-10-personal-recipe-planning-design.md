# Personal Recipe Library and Weekly Planning Design

**Status:** Superseded implementation design

This document records the pre-shipment planning model. The active contract is
defined by `AGENTS.md`, `CONTEXT.md`, `README.md`, and ADR 0019/0020. Do not
implement from the old `personal_recipes` or `personal_planning_items` names.

## Goal

Give a household a private place to save recipes, import a recipe from a public
HTTPS URL, review the extracted fields, and place recipes on any day and
configured meal slot in the current Week view.

## Product boundary

Personal recipes are never reviewed Little Plate catalog content. The active
product stores caregiver-supplied or source-extracted text without rewriting it
into safety guidance. Personal recipes can be manually assigned in Week, shown
as the next planned recipe in Today, and used for lightweight Kitchen notes.
The product makes no safety, allergen, medical, developmental, serving,
storage, expiration, nutrition, or feeding-eligibility judgments.

## Data model

The shipped model uses household-owned `recipes` records with title,
ingredients, instructions, notes, optional public HTTPS source URL, source type
(`manual` or `imported`), import status, tags, favorite state, and timestamps.

`recipe_week_slots` records link a recipe to a local date and configured meal
slot. `prepared_notes` records store preparation status, optional portions, and
personal notes. These are separate from the retired reviewed-food lifecycle.

All active recipe tables are household-private through authenticated RLS and
the existing account-deletion boundary.

## Recipe-link import

The server accepts only absolute public HTTPS URLs. It rejects localhost,
loopback, private/link-local IP literals, non-HTTPS schemes, redirects to a
non-public URL, oversized responses, non-HTML content, and fetches that exceed
the short timeout. It does not send cookies or credentials.

Extraction uses this order:

1. Recipe JSON-LD, including `@graph` and array forms;
2. clearly structured article recipe sections;
3. a recoverable failure when complete recipe fields cannot be extracted.

The result is an editable review payload. Nothing is persisted until the
caregiver confirms the fields. A blocked or malformed page returns a clear
error and a direct manual recipe-entry path.

## User flows

- `/recipes` lists household recipes and gives actions to import a URL or create
  one manually.
- `/recipes/import` accepts a URL, shows extracted fields, and lets the
  caregiver edit before saving.
- `/recipes/new` creates a manual recipe.
- A recipe detail page displays its source and offers a Week placement form for
  any day in the current seven-day window and any configured meal slot.
- Week renders manually planned recipes, Today shows the next planned recipe,
  and Kitchen records preparation notes. None of these flows performs safety
  review, automatic planning, inventory, storage, or serving calculations.

## Failure and lifecycle rules

- Extracted text is never silently treated as complete; missing title,
  ingredients, or instructions remains editable and visibly incomplete.
- A recipe can be edited or deleted by household caregivers. Deleting a recipe
  must not modify another household's records or reintroduce the retired
  reviewed-food lifecycle.
- Recipes, plans, notes, and image metadata remain private to the household.
- A source image detected during import is only a suggestion. It is saved only
  after explicit caregiver confirmation with alternative text.

## Non-goals

- No automatic safety assessment, allergen inference, storage calculation, or
  medical guidance.
- No copying or republishing of third-party recipe pages beyond the fields the
  caregiver chooses to save; the original URL remains the source reference.
- No inventory deduction, refrigerated-batch creation, serving workflow,
  automatic planning, notifications, social features, or public sharing.
