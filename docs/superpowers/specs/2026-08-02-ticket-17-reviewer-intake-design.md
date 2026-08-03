# Ticket 17 Reviewer Intake Packet Design

## Goal

Give qualified reviewers and the release owner a version-controlled, import-shaped packet for supplying the first ten PRD foods without allowing placeholders to be mistaken for approved production content.

## Boundaries

- The packet contains field names, review instructions, and explicit required-input markers only.
- It does not contain preparation, allergen, choking, storage, medical, or other safety values.
- It does not modify `supabase/seed.sql`, migrations, RPCs, or production catalog state.
- The JSON filename remains non-importable until a reviewer replaces every marker and the release owner records approval evidence.

## Approach

Use four repository-native artifacts under `docs/catalog-review/`:

1. `README.md` explains the safety boundary, reviewer authority contract, workflow, and handoff evidence.
2. `catalog-package.template.json` mirrors the existing `import_catalog_fixture` shape with `REQUIRED_REVIEWER_INPUT` markers.
3. `first-ten-foods.template.md` tracks the ten PRD target foods without adding safety claims.
4. `reviewer-authority.template.md` records role mappings and evidence locations without private contact data.

The packet is deliberately separate from the importer. Once supplied, Codex can validate the completed package through the existing release procedure, source checker, clean reset, representative browser QA, and full verification gate.

## Acceptance

- Every required catalog section is represented in the JSON template.
- Every approved-revision safety field is visibly marked as reviewer-supplied.
- The ten-food tracker contains only PRD food names and completion gates.
- Reviewer authority, approval evidence, visual rights, overdue policy, and privacy rules are explicit.
- A source scan, whitespace check, and JSON parse check pass for the packet itself.
