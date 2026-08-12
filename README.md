# Little Plate Recipes

Little Plate Recipes is a private, mobile-first recipe box and manual meal
planner for one caregiver and one household.

The app lets a caregiver enter recipes, save editable recipe details from
public websites, choose individual recipes from multi-recipe articles, search
and favorite recipes, assign one recipe to each Week meal slot, see the next
planned recipe in Today, and keep lightweight Kitchen preparation notes. Each
recipe can have one optional cover image supplied by a private upload or an
explicitly approved external URL.

Website imports are editable before saving. Re-importing a normalized source
URL highlights the existing recipe instead of overwriting it; a separate copy
requires an explicit choice. Confirmed cover images appear on recipe cards and
fall back cleanly when an external image stops loading.

Recipes are private personal content. The app does not make safety, allergen,
medical, developmental, serving, storage, expiration, nutrition, or feeding-
eligibility judgments. It also does not include pantry inventory, grocery
lists, automatic planning, notifications, social features, ratings, or public
sharing.

## Product documents

- [Active context](CONTEXT.md)
- [Repository guidance](AGENTS.md)
- [Personal recipe pivot ADR](docs/adr/0019-personal-recipe-platform-boundary.md)
- [Implementation plan](docs/superpowers/plans/personal-recipe-platform-pivot-plan.md)

The earlier reviewed-food ADRs and product issues remain migration history. They
are not active caregiver product requirements.

## Local setup

Requirements: Node.js 20.9+, pnpm 11, Docker Desktop, and Git.

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
Copy-Item .env.example .env.local
pnpm exec supabase start
pnpm exec supabase db reset --local
pnpm dev
```

Passwordless local sign-in links arrive in Mailpit at
[http://127.0.0.1:56324](http://127.0.0.1:56324). Keep private pilot access
allowlisted in non-local deployments with `PRIVATE_PILOT_ALLOWED_EMAILS`.

## Verification

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:integration
pnpm test:e2e
git diff --check
```

The integration and browser suites reset the local Supabase database before
running. Use `pnpm exec supabase`, because the repository pins the CLI version.
