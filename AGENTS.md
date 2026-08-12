# Repository guidance

YOU ARE AN AUTONOMOUS CODING AGENT. Complete the requested feature end to end
and verify it before handing it back. Keep unrelated user changes intact.

## Active product

This repository is a private, mobile-first recipe organizer and manual meal
planner for one caregiver and one household. The caregiver can:

- enter recipes manually;
- import public recipe details from another website and edit them before saving;
- search recipes by title, ingredient, or tag;
- favorite recipes and retain source attribution;
- assign one saved recipe to each Week meal slot;
- see the next manually planned recipe in Today;
- record preparation status, optional portions, and personal notes in Kitchen;
- add one optional cover image by private upload or approved external URL.

Personal and imported recipes are private, editable, and unreviewed. The app
must not present them as safe, eligible, medically appropriate, allergen-free,
storage-approved, or developmentally reviewed. Do not reintroduce the former
catalog, feeding-eligibility, reaction, expiration, inventory, grocery,
automatic-planner, notification, social, rating, or public-sharing workflows.

## Security and privacy boundaries

- Keep passwordless authentication, invite-only pilot access, household RLS,
  and account deletion.
- Never expose one household's recipes, plans, notes, or images to another.
- Imported recipe content is untrusted text. Never execute or render imported
  HTML, scripts, or unsanitized markup.
- URL import is best effort and server-side only. Validate scheme, credentials,
  DNS/IP destination, redirects, timeout, content type, and response size.
  Do not bypass logins, paywalls, or access controls.
- Do not copy a source image automatically. A page image may be suggested, but
  the caregiver must explicitly confirm an image before saving it.
- Never expose Supabase service-role keys in browser code.
- Keep private image storage private and use household-scoped object paths.

## Engineering

- Keep domain validation and state transitions separate from UI and transport.
- Prefer deterministic pure functions for parsing, filtering, Week ordering,
  image validation, and preparation-note lifecycle.
- Use additive, reviewable Supabase migrations. Enable RLS on every exposed
  table and use both `USING` and `WITH CHECK` for updates.
- Preserve the existing account bootstrap and deletion boundaries unless the
  active issue explicitly changes them.
- Do not delete legacy migrations during the pivot. Remove active imports and
  routes only after replacement coverage exists.
- Use `apply_patch` for source edits. Do not mix unrelated refactors.

## Verification

Use repository-defined scripts. The complete gate is:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:catalog-sources
pnpm build
pnpm test:integration
pnpm test:e2e
git diff --check
```

The default gate covers the active personal recipe platform. The former
safety/planner implementation remains available through the explicit legacy
gate:

```powershell
pnpm verify:legacy
```

Use the pinned CLI (`pnpm exec supabase`), not a stale global Supabase binary.
Changed domain rules require focused tests. Changed database behavior requires
local reset/integration coverage. Changed user flows require mobile browser
coverage. Do not claim a check passed unless it actually ran.

## Git and handoff

Do not commit, push, or open a pull request unless explicitly requested. Preserve
unrelated working-tree changes. At handoff, list changed files, verification
results, known limitations, and the active branch/worktree location.
