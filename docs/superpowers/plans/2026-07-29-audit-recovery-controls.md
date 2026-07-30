# Audit Recovery Controls Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Resolve the four actionable browser-audit findings without weakening Project Little Plate's reviewed-content or feeding-eligibility safety boundaries.

**Architecture:** Extend the existing authenticated account and profile commands instead of creating parallel identity paths. Keep planner availability derived from the existing verified read model, and expose the local email-capture link only through a validated public development setting. No task changes curated content, eligibility semantics, inventory, serving history, or storage rules.

**Tech Stack:** Next.js App Router, React server actions, TypeScript, Supabase SSR/Postgres, Vitest, Playwright, pnpm.

---

## Task 1: Ticket 19 — Add account session controls

**Files:**

- Create: `src/app/account/sign-out-form.tsx`
- Create: `src/modules/profiles/session-actions.ts`
- Create: `src/modules/profiles/session-form-state.ts`
- Modify: `src/app/account/page.tsx`
- Modify: `src/app/login/page.tsx`
- Test: `tests/e2e/account-deletion.spec.ts`
- Update: `.scratch/project-little-plate-v1/issues/19-add-account-session-controls.md`

### Step 1: Write the failing browser test

- [ ] Add a signed-in account test that expects a visible `Sign out` control.
- [ ] Submit the control and expect `/login?signedOut=1`.
- [ ] Expect a calm signed-out confirmation.
- [ ] Revisit `/account` and expect the protected-route redirect to login.
- [ ] Sign in again and assert the same active baby/profile is restored.

Run:

```powershell
pnpm exec playwright test tests/e2e/account-deletion.spec.ts --grep "signs out"
```

Expected: FAIL because the account page has no sign-out control or action.

### Step 2: Implement the minimal session command

- [ ] Add a form state with only honest idle/error outcomes.
- [ ] Add a server action that obtains the existing server Supabase client and calls:

```ts
const { error } = await supabase.auth.signOut({ scope: "local" });
if (error)
  return {
    status: "error",
    message: "We could not sign you out. Please try again."
  };
redirect("/login?signedOut=1");
```

- [ ] Add a client form using `useActionState`, pending-button behavior, and an accessible status region.
- [ ] Render a separate non-destructive `Session` card before the destructive account deletion card.
- [ ] Read `signedOut` on the login page and render confirmation without exposing auth details.

### Step 3: Prove the focused behavior

- [ ] Re-run the focused Playwright test and confirm PASS.
- [ ] Run the existing account deletion spec to prove the destructive boundary is unchanged:

```powershell
pnpm exec playwright test tests/e2e/account-deletion.spec.ts
```

- [ ] Run:

```powershell
pnpm typecheck
git diff --check
```

### Step 4: Record and commit Ticket 19

- [ ] Update the issue with decisions, changed artifacts, acceptance evidence, fixture status, and remaining risks.
- [ ] Mark the ticket complete only if every acceptance criterion is satisfied.
- [ ] Commit only Ticket 19 artifacts:

```powershell
git add src/app/account src/app/login/page.tsx src/modules/profiles/session-actions.ts src/modules/profiles/session-form-state.ts tests/e2e/account-deletion.spec.ts .scratch/project-little-plate-v1/issues/19-add-account-session-controls.md
git commit -m "feat: add account session controls"
```

## Task 2: Ticket 20 — Edit the active baby profile

**Files:**

- Modify: `src/app/account/page.tsx`
- Modify: `src/app/profile-setup/page.tsx`
- Modify: `src/app/profile-setup/profile-form.tsx`
- Modify: `src/modules/profiles/actions.ts`
- Test: `tests/integration/authenticated-baby-profile.test.ts`
- Test: `tests/e2e/authenticated-baby-profile.spec.ts`
- Update: `.scratch/project-little-plate-v1/issues/20-edit-the-active-baby-profile.md`

### Step 1: Write failing profile-edit tests

- [ ] Add an integration test proving the existing transactional RPC updates the same active baby and leaves one active membership/baby.
- [ ] Add a browser test that starts from Account, follows `Edit baby profile`, sees current values, changes nickname/timezone/feeding style/meal slots, and saves.
- [ ] Assert the success returns to Account, shows confirmation, and Today/Week reflect the updated display data.
- [ ] Add an invalid submission assertion proving the existing values remain unchanged atomically.

Run:

```powershell
pnpm vitest run tests/integration/authenticated-baby-profile.test.ts
pnpm exec playwright test tests/e2e/authenticated-baby-profile.spec.ts --grep "edits the active baby profile"
```

Expected: the new browser scenario FAILS because existing profiles are redirected away from the form and the form has no edit defaults.

### Step 2: Reuse the existing transactional profile boundary

- [ ] Add an explicit edit query flag, for example `/profile-setup?mode=edit`, that is only reachable for an authenticated active baby.
- [ ] Load the active baby/profile membership and derive initial values for every originally collected field.
- [ ] Pass typed initial values and mode into the existing `ProfileForm`.
- [ ] Keep `complete_baby_profile` as the only write path; do not add direct table updates.
- [ ] Let the action select its success redirect:

```ts
const destination =
  formData.get("mode") === "edit" ? "/account?profileUpdated=1" : "/today";
redirect(destination);
```

- [ ] Add an Account link and success confirmation.
- [ ] Preserve create-mode defaults and onboarding behavior.

### Step 3: Prove profile and safety boundaries

- [ ] Re-run the focused integration and browser tests.
- [ ] Run all authenticated profile tests:

```powershell
pnpm vitest run tests/integration/authenticated-baby-profile.test.ts
pnpm exec playwright test tests/e2e/authenticated-baby-profile.spec.ts
```

- [ ] Confirm no second baby, inventory, meal, eligibility, or reviewed-content record is created or changed.
- [ ] Run:

```powershell
pnpm typecheck
git diff --check
```

### Step 4: Record and commit Ticket 20

- [ ] Update the issue with acceptance evidence and the fact that ADR 0002's existing transactional command was reused.
- [ ] Commit only Ticket 20 artifacts:

```powershell
git add src/app/account/page.tsx src/app/profile-setup src/modules/profiles/actions.ts tests/integration/authenticated-baby-profile.test.ts tests/e2e/authenticated-baby-profile.spec.ts .scratch/project-little-plate-v1/issues/20-edit-the-active-baby-profile.md
git commit -m "feat: edit the active baby profile"
```

## Task 3: Ticket 21 — Make planner unavailability actionable

**Files:**

- Modify: `src/app/week/page.tsx`
- Test: `tests/e2e/planner-generation.spec.ts`
- Update: `.scratch/project-little-plate-v1/issues/21-make-planner-unavailability-actionable.md`

### Step 1: Write the failing zero-option browser test

- [ ] With the production-safe empty catalog, assert Week still shows its dates and meal slots.
- [ ] Assert it does not show an enabled `Generate week` button.
- [ ] Assert an unavailable card explains that no eligible reviewed preparations are available.
- [ ] Assert links to Foods and Feeding eligibility are present.
- [ ] Preserve the existing synthetic reviewed fixture test that can generate a week.

Run:

```powershell
pnpm exec playwright test tests/e2e/planner-generation.spec.ts --grep "no eligible reviewed preparations"
```

Expected: FAIL because the generation button is currently enabled for a verified empty option set.

### Step 2: Render availability from the verified read model

- [ ] In the current editable week, branch only when the successful `getWeekEditOptions()` result contains zero eligible options.
- [ ] Render calm, non-diagnostic copy such as:

```tsx
<h2>Weekly planning is not available yet</h2>
<p>No eligible reviewed food preparations are available for this profile.</p>
```

- [ ] Link to `/foods` and `/feeding-eligibility`.
- [ ] Do not infer which specific content, profile skill, or eligibility rule caused the empty set.
- [ ] Keep the current generic failure state for transport/database errors.
- [ ] Keep the generation form unchanged for non-empty reviewed fixtures.

### Step 3: Prove empty and ready states

- [ ] Run the focused empty-catalog scenario.
- [ ] Run the complete planner generation browser spec:

```powershell
pnpm exec playwright test tests/e2e/planner-generation.spec.ts
```

- [ ] Run:

```powershell
pnpm typecheck
git diff --check
```

### Step 4: Record and commit Ticket 21

- [ ] Update the issue with evidence that reviewed-content and feeding-eligibility rules were consumed unchanged.
- [ ] Commit only Ticket 21 artifacts:

```powershell
git add src/app/week/page.tsx tests/e2e/planner-generation.spec.ts .scratch/project-little-plate-v1/issues/21-make-planner-unavailability-actionable.md
git commit -m "fix: explain planner unavailability"
```

## Task 4: Ticket 22 — Explain local passwordless email delivery

**Files:**

- Modify: `src/config/environment.ts`
- Modify: `src/config/environment.test.ts`
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/login/login-form.tsx`
- Modify: `.env.example`
- Modify: `README.md`
- Test: `tests/e2e/authenticated-baby-profile.spec.ts`
- Update: `.scratch/project-little-plate-v1/issues/22-explain-local-passwordless-email-delivery.md`

### Step 1: Write failing configuration and browser tests

- [ ] Add environment tests for:
  - absent `NEXT_PUBLIC_LOCAL_MAIL_URL` returns no local inbox;
  - `http://127.0.0.1:56324` and loopback `localhost` are accepted;
  - external, credential-bearing, non-HTTP(S), malformed, and non-loopback values are rejected safely.
- [ ] Add a browser assertion that successful local magic-link submission shows `Open local inbox`.

Run:

```powershell
pnpm vitest run src/config/environment.test.ts
pnpm exec playwright test tests/e2e/authenticated-baby-profile.spec.ts --grep "local inbox"
```

Expected: FAIL because the optional setting and UI note do not exist.

### Step 2: Add the validated optional public setting

- [ ] Parse the optional URL without making it required for production.
- [ ] Accept only absolute HTTP(S) URLs whose hostname is `localhost`, `127.0.0.1`, or `[::1]`.
- [ ] Reject usernames/passwords and discard query/hash components or reject the value entirely.
- [ ] Return `undefined` for unsafe or invalid configuration so the login UI remains production-neutral.

Example shape:

```ts
type PublicEnvironment = {
  appUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  localMailUrl?: string;
};
```

### Step 3: Show the link only after successful local submission

- [ ] Pass the validated URL from the login server page to the client form.
- [ ] Add `Open local inbox` only inside the successful `Check your email` state.
- [ ] Use a normal safe link; do not append the submitted email, token, or redirect.
- [ ] Keep the existing production copy unchanged when the setting is absent.
- [ ] Document the optional variable in `.env.example` and the local Supabase section of README.

### Step 4: Prove local and production-neutral behavior

- [ ] Run the focused unit and browser tests.
- [ ] Run:

```powershell
pnpm vitest run src/config/environment.test.ts
pnpm exec playwright test tests/e2e/authenticated-baby-profile.spec.ts
pnpm typecheck
git diff --check
```

### Step 5: Record and commit Ticket 22

- [ ] Update the issue with accepted/rejected URL fixtures and browser evidence.
- [ ] Commit only Ticket 22 artifacts:

```powershell
git add src/config/environment.ts src/config/environment.test.ts src/app/login .env.example README.md tests/e2e/authenticated-baby-profile.spec.ts .scratch/project-little-plate-v1/issues/22-explain-local-passwordless-email-delivery.md
git commit -m "feat: explain local email capture"
```

## Task 5: Cross-ticket review and completion evidence

**Files:**

- Modify only if evidence changes are needed:
  - `.scratch/project-little-plate-v1/issues/19-add-account-session-controls.md`
  - `.scratch/project-little-plate-v1/issues/20-edit-the-active-baby-profile.md`
  - `.scratch/project-little-plate-v1/issues/21-make-planner-unavailability-actionable.md`
  - `.scratch/project-little-plate-v1/issues/22-explain-local-passwordless-email-delivery.md`

### Step 1: Run the two-axis review

- [ ] Review specification compliance against the approved design and each issue.
- [ ] Review code quality, lifecycle completeness, accessibility, privacy, and safety-boundary preservation.
- [ ] Resolve every confirmed finding with the same red-green discipline.

### Step 2: Run the complete verification entry point once

```powershell
pnpm verify
git diff --check
```

- [ ] Run locally available Supabase database lint/advisors if the local CLI exposes them; record precise external or tooling blocks.
- [ ] Do not claim any command passed unless it completed successfully.

### Step 3: Perform the final live browser audit

- [ ] Sign in through local Mailpit.
- [ ] Edit the active profile and verify Account, Today, and Week reflect it.
- [ ] Verify the empty-catalog Week unavailable state and both recovery links.
- [ ] Sign out, verify route protection, then sign back in and verify the same household data remains.
- [ ] Confirm no console errors or safety guidance invented by the UI.

### Step 4: Close evidence and commit only if needed

- [ ] Add final command results and remaining external reviewed-content risk to the four issues.
- [ ] If this produces documentation-only changes, commit them separately:

```powershell
git add .scratch/project-little-plate-v1/issues/19-add-account-session-controls.md .scratch/project-little-plate-v1/issues/20-edit-the-active-baby-profile.md .scratch/project-little-plate-v1/issues/21-make-planner-unavailability-actionable.md .scratch/project-little-plate-v1/issues/22-explain-local-passwordless-email-delivery.md
git commit -m "docs: record audit recovery verification"
```

- [ ] Confirm `git status -sb` has no unintended changes.
- [ ] Stop after Ticket 22. Do not begin another ticket, push, open a PR, or merge.
