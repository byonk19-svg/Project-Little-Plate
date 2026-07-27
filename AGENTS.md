AGENTS.md

This file is the canonical repository-level guidance for coding agents working on this product. It applies to the entire repository unless a more specific AGENTS.md exists deeper in the tree.

Follow the user’s explicit task, the active local issue, this file, CONTEXT.md, relevant product documentation, and accepted ADRs. Do not silently expand scope or reinterpret acceptance criteria.

Product purpose

This repository contains a standalone, mobile-first baby-feeding planner for caregivers of babies approximately 9–15 months old.

The core promise is:

Know what to feed next, using what you already have, before it expires.

The product connects four workflows:

Today — show a realistic next meal using safe, available food.

Week — plan practical component-based meals with controlled variety.

Kitchen — track preparation, refrigerator/freezer portions, and use-soon food.

Foods — show reviewed preparation, serving, allergen, and storage information.

This is a baby meal operations tool, not a general recipe platform, calorie tracker, medical feeding system, or family meal planner.

Non-negotiable safety boundary

Safety-critical production content must be curated, structured, source-backed, versioned, and reviewed. Agents and AI models must not invent, infer, interpolate, or rewrite safety guidance from general knowledge.

Safety-critical content includes, but is not limited to:

developmental stage eligibility;

food shape, size, texture, cooking, cutting, mashing, or serving instructions;

choking-prevention guidance;

allergen and reaction guidance;

cooking temperatures and handling requirements;

refrigerator, freezer, thawing, and time-out-of-refrigeration rules;

storage classifications and use-by calculations;

emergency, medical, or clinician-facing copy.

Required behavior:

Use only active, reviewed records with complete source metadata.

Treat missing or unsupported guidance as unsupported. Fail safely with a clear unavailable state; never guess.

Safety restrictions always override preferences, variety goals, planner scoring, and convenience.

Never recommend an expired, finished, discarded, unavailable, excluded, or potentially saliva-exposed portion.

Do not let users casually extend a reviewed storage deadline.

Preserve source, review date, review status, version, and the rule applied to historical calculations.

Do not silently rewrite historical safety outcomes after a rule changes. Document and test any migration policy.

Do not present false precision. When a source provides a range, apply the documented conservative policy and explain it plainly.

UI components must not hard-code safety values. They must render values supplied by the reviewed domain/content layer.

Any change to safety semantics requires focused automated tests and review of affected documentation, seed data, and migrations.

Public release of safety content requires the qualified review described in the product requirements.

An AI model may later assist with non-safety tasks only when constrained to reviewed product data. It may not produce production values for the categories above.

Product and design principles

Today first. Optimize for the caregiver who needs an answer at mealtime.

Components over elaborate recipes. Model reusable foods and preparations cleanly.

Less input than value. Common actions should require one or two taps when practical.

Use existing food first. Available and use-soon portions should influence suggestions before creating more prep work.

Deterministic and explainable. Planning, filtering, storage, and inventory behavior must be testable and able to explain why a suggestion was made.

Skills matter, not age alone. Age may suggest a starting stage; reviewed preparation eligibility must also respect caregiver-selected skills and overrides.

Calm, not judgment. Do not score parents, babies, plate completion, or nutritional perfection.

Fast recovery. Planned meals must support safe, realistic swaps when the original plan fails.

Narrow scope. Do not turn V1 into a social network, full pantry, family meal planner, medical tool, or giant content library.

Engineering boundaries

Keep domain rules separate from UI rendering and transport/database concerns.

Prefer pure, deterministic functions for planner filtering, scoring, storage-rule selection, deadline application, portion accounting, and state transitions.

Store and expose enough provenance to explain every safety-relevant result.

Keep safety content and storage rules version-controlled and machine-validated.

Reject active content that lacks required source, review, stage, or rule metadata.

Treat timezones, date boundaries, and daylight-saving transitions as explicit domain concerns. Test them.

Preserve immutable or append-only event history where auditability matters, especially for batch events and curated-content changes.

Make migrations reviewable, narrowly scoped, and safe for existing data. Document backfills and irreversible choices.

Do not introduce a new framework, state-management system, database abstraction, or major dependency without a demonstrated need. Record durable architectural choices in an ADR.

Follow existing repository conventions before creating new ones.

Do not perform unrelated refactors while implementing a scoped issue.

Scope control

Before coding:

Read this file, root CONTEXT.md, the active issue, relevant product documentation, and applicable ADRs.

Inspect the current implementation and tests rather than assuming the requested behavior is absent.

Restate the smallest coherent change needed to satisfy the issue.

Identify whether the work touches safety content, safety semantics, storage calculations, exclusions, or historical data.

During implementation:

Keep the diff focused on the issue.

Reuse existing abstractions when they fit; do not force reuse when it would obscure domain rules.

Add or update tests with the behavior change.

Update documentation in the same change when behavior, invariants, commands, schema, or architecture changes.

Stop and document the uncertainty when a requirement would require inventing safety guidance or unsupported product policy.

Do not create speculative infrastructure for later phases unless the active issue requires it.

Agent skills

Issue tracker

Issues are tracked as local Markdown files under .scratch/. External PRs are not a triage surface. See docs/agents/issue-tracker.md.

Use the .scratch/<feature>/issues/ convention and keep the active issue current with scope, acceptance criteria, decisions, evidence, and unresolved risks. Do not treat GitHub PRs or external issue systems as the canonical triage source unless the user explicitly changes this policy.

Triage labels

The standard five-role vocabulary is used. See docs/agents/triage-labels.md.

Use the exact documented labels. Do not invent near-synonyms or expand the vocabulary casually.

Domain docs

This is a single-context repository. See docs/agents/domain.md.

Root CONTEXT.md contains the durable product and domain context agents need before working.

docs/adr/ contains accepted architectural decisions.

Create or update an ADR when changing durable boundaries such as planner architecture, safety-content governance, storage semantics, event history, schema ownership, or major dependencies.

Do not use ADRs for routine implementation details.

Verification

Use repository-defined scripts from package.json; do not invent successful commands. The repository should converge on one complete verification entry point:

pnpm verify

Until that script exists or when isolating failures, run the applicable defined commands, typically:

pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e

Also run:

git diff --check

Verification expectations:

Run unit tests for every changed domain rule.

Run storage boundary, timezone, daylight-saving, expiration, and portion-accounting tests when those areas change.

Run content validation for changes to foods, preparation variants, sources, or storage rules.

Run relevant end-to-end flows for user-visible changes to onboarding, Today, Week, Kitchen, Foods, serving, swapping, or expiration behavior.

Validate database migrations and generated types when the schema changes.

Never claim a command passed unless it was actually run and completed successfully.

If a required script is missing, blocked, or fails for an unrelated pre-existing reason, report that precisely in the issue and final handoff.

Definition of done

A task is complete only when:

the active issue’s acceptance criteria are satisfied;

the implementation preserves the safety boundary above;

relevant automated tests were added or updated and pass;

applicable lint, typecheck, build, migration, content-validation, and end-to-end checks pass;

documentation and ADRs reflect durable changes;

the diff contains no unrelated edits or temporary debugging artifacts;

the local issue records validation evidence and remaining risks;

the final handoff lists changed files, commands run with results, and any known limitations.

Do not mark work complete merely because the happy path renders. Unsupported, empty, stale, expired, excluded, error, rollback, and recovery states are part of the feature.

Git and handoff behavior

Do not commit, push, open a PR, merge, or rewrite history unless the user or active task explicitly authorizes it.

Never discard unrelated user changes.

Keep generated files, lockfiles, migrations, and snapshots only when they are intentional consequences of the change.

At handoff, be direct about incomplete verification or unresolved risk. Do not hide uncertainty behind a confident summary.
