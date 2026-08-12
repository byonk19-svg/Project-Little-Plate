# ADR 0020: Recipe platform module seams

- Status: Accepted
- Date: 2026-08-11

## Context

The personal recipe platform is now the active caregiver-facing product, but
its import, household session, recipe write, and legacy-isolation concerns are
distributed across several callers. The current implementation works, yet the
same workflow facts are repeated at multiple seams. That makes changes harder
to localize and makes tests follow implementation details rather than the
caregiver-visible workflow.

## Decision

- Deepen the **recipe import module** around two caller-visible operations:
  non-destructive preview and explicit reviewed-import save. Preview returns
  normalized drafts, duplicate matches, image suggestions, and recoverable
  failure states; it never exposes raw markup or saves partial data.
- Deepen a shared **household session context** module for Recipes, import,
  images, Week, Today, and Kitchen. It distinguishes authenticated household,
  signed-out session, and unavailable household profile outcomes.
- Deepen the **recipe write module** behind thin manual-create, reviewed-import,
  and edit entry points. Shared policy owns normalization, caregiver-edit
  preservation, explicit duplicate replacement, image handling, persistence,
  and revalidation.
- Isolate **legacy implementation history** through repository organization and
  verification choices. Active recipe-platform code and tests are the default;
  legacy verification becomes explicit. Historical migrations are retained and
  are not rewritten or deleted as part of this refactor.

## Consequences

- The recipe import workflow has one stable interface even if source formats,
  duplicate matching, or persistence adapters change.
- Household isolation and session recovery behavior have one place to test and
  one invariant for callers to consume.
- Manual, imported, and edited recipe writes share preservation rules instead
  of carrying separate copies of the policy.
- Agents can find active recipe work without treating legacy safety/planner
  code as current product behavior.
- The implementation should use internal seams for parsing, database access,
  and image storage; no new external adapter is justified until a second
  concrete adapter or test replacement requires it.

## Non-goals

- Do not reintroduce safety, allergen, medical, developmental, storage,
  expiration, inventory, grocery, automatic-planner, or public-sharing product
  behavior.
- Do not delete historical migrations or rewrite the legacy domain merely to
  reduce line count.
- Do not expose implementation interfaces to UI callers before the module
  behavior and test surface are designed.

## Reversal conditions

Revisit this decision if the active product adds a second recipe source with
meaningfully different import behavior, a second household identity adapter,
or a new workflow that cannot use the preserved recipe-write policy. Revisit
legacy isolation only when retaining the old implementation creates a measured
verification or navigation cost that outweighs migration risk.
