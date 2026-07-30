import { execFileSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { readLocalSupabaseStatus } from "../integration/support/local-supabase";
import {
  waitForMagicLink,
  waitForMagicLinkMessage
} from "./support/passwordless-auth";

type AccountProfileSnapshot = {
  userProfiles: Array<{ user_id: string; household_id: string }>;
  households: Array<{ id: string }>;
  babies: Array<{
    id: string;
    household_id: string;
    is_active: boolean;
  }>;
};

function readAccountProfileSnapshot(userId: string): AccountProfileSnapshot {
  expect(userId).toMatch(/^[0-9a-f-]{36}$/);
  const output = execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_mealboard-baby",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-Atc",
      `with target_profiles as (
        select user_id::text, household_id::text
        from public.user_profiles
        where user_id = '${userId}'
      )
      select json_build_object(
        'userProfiles',
        coalesce(
          (
            select json_agg(row_to_json(profile_row) order by profile_row.user_id)
            from target_profiles profile_row
          ),
          '[]'::json
        ),
        'households',
        coalesce(
          (
            select json_agg(row_to_json(household_row) order by household_row.id)
            from (
              select households.id::text as id
              from public.households
              join target_profiles
                on target_profiles.household_id = households.id::text
            ) household_row
          ),
          '[]'::json
        ),
        'babies',
        coalesce(
          (
            select json_agg(row_to_json(baby_row) order by baby_row.id)
            from (
              select
                babies.id::text as id,
                babies.household_id::text as household_id,
                babies.is_active
              from public.babies
              join target_profiles
                on target_profiles.household_id = babies.household_id::text
            ) baby_row
          ),
          '[]'::json
        )
      )`
    ],
    { encoding: "utf8" }
  ).trim();

  return JSON.parse(output) as AccountProfileSnapshot;
}

test("a caregiver signs out locally and returns to the same active baby", async ({
  page,
  request
}) => {
  test.setTimeout(120_000);
  const status = readLocalSupabaseStatus();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const email = `ticket-19-browser-${crypto.randomUUID()}@example.test`;

  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email.", {
    timeout: 20_000
  });
  const firstMagicLink = await waitForMagicLinkMessage(request, email);
  await page.goto(firstMagicLink.href);
  await page.getByLabel("Nickname (optional)").fill("Session browser");
  await page.getByLabel("Birth date").fill("2025-10-15");
  await page.getByLabel("Time zone").fill("America/Chicago");
  await page.getByLabel("Mixed feeding").check();
  await page.getByLabel("Breakfast").check();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/today$/, { timeout: 20_000 });

  const usersBeforeSignOut = await admin.auth.admin.listUsers();
  const userBeforeSignOut = usersBeforeSignOut.data.users.find(
    (candidate) => candidate.email === email
  );
  expect(userBeforeSignOut).toBeTruthy();
  const profileSnapshotBeforeSignOut = readAccountProfileSnapshot(
    userBeforeSignOut!.id
  );
  expect(profileSnapshotBeforeSignOut.userProfiles).toHaveLength(1);
  const householdIdBeforeSignOut =
    profileSnapshotBeforeSignOut.userProfiles[0]?.household_id;
  expect(householdIdBeforeSignOut).toMatch(/^[0-9a-f-]{36}$/);
  expect(profileSnapshotBeforeSignOut.households).toEqual([
    { id: householdIdBeforeSignOut }
  ]);
  expect(profileSnapshotBeforeSignOut.babies).toHaveLength(1);
  expect(profileSnapshotBeforeSignOut.babies[0]?.is_active).toBe(true);
  const activeBabyIdBeforeSignOut = profileSnapshotBeforeSignOut.babies[0]?.id;
  expect(activeBabyIdBeforeSignOut).toMatch(/^[0-9a-f-]{36}$/);

  await page.goto("/account");
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Session" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login\?signedOut=1$/, {
    timeout: 20_000
  });
  await expect(page.getByRole("status")).toContainText(
    "You’re signed out. Your household data is still here for your next sign-in."
  );

  await page.goto("/feeding-setup");
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/account");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email.", {
    timeout: 20_000
  });
  const secondMagicLink = await waitForMagicLinkMessage(request, email, [
    firstMagicLink.messageId
  ]);
  await page.goto(secondMagicLink.href);
  await expect(page).toHaveURL(/\/today$/, { timeout: 20_000 });
  await expect(
    page.getByText("Session browser’s profile is ready.")
  ).toBeVisible();

  const usersAfterSignIn = await admin.auth.admin.listUsers();
  const matchingUsers = usersAfterSignIn.data.users.filter(
    (candidate) => candidate.email === email
  );
  expect(matchingUsers).toHaveLength(1);
  expect(matchingUsers[0]?.id).toBe(userBeforeSignOut!.id);

  const profileSnapshotAfterSignIn = readAccountProfileSnapshot(
    userBeforeSignOut!.id
  );
  expect(profileSnapshotAfterSignIn).toEqual(profileSnapshotBeforeSignOut);
  expect(profileSnapshotAfterSignIn.userProfiles).toHaveLength(1);
  expect(profileSnapshotAfterSignIn.households).toHaveLength(1);
  expect(profileSnapshotAfterSignIn.babies).toHaveLength(1);
  expect(profileSnapshotAfterSignIn.babies[0]?.id).toBe(
    activeBabyIdBeforeSignOut
  );
});

test("a caregiver reviews retention, confirms deletion, and loses account access", async ({
  page,
  request
}) => {
  test.setTimeout(120_000);
  const status = readLocalSupabaseStatus();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const email = `ticket-16-browser-${crypto.randomUUID()}@example.test`;

  await page.goto("/login?deleted=1");
  await expect(
    page.getByText(
      "Your Little Plate account and active household records were deleted."
    )
  ).toHaveCount(0);

  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email.", {
    timeout: 20_000
  });
  await page.goto(await waitForMagicLink(request, email));
  await page.getByLabel("Nickname (optional)").fill("Deletion browser");
  await page.getByLabel("Birth date").fill("2025-10-15");
  await page.getByLabel("Time zone").fill("America/Chicago");
  await page.getByLabel("Mixed feeding").check();
  await page.getByLabel("Breakfast").check();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/today$/, { timeout: 20_000 });

  const users = await admin.auth.admin.listUsers();
  const user = users.data.users.find((candidate) => candidate.email === email);
  expect(user).toBeTruthy();
  const householdId = execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_mealboard-baby",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-Atc",
      `select household_id from public.user_profiles where user_id = '${user!.id}'`
    ],
    { encoding: "utf8" }
  ).trim();
  expect(householdId).toMatch(/^[0-9a-f-]{36}$/);

  await page.getByRole("link", { name: "Account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(
    page.getByRole("heading", { name: "Delete account and household data" })
  ).toBeVisible();
  await expect(page.getByTestId("deletion-scope")).toContainText(
    "baby profile, plans, inventory, and history"
  );
  await expect(page.getByTestId("deletion-retention")).toContainText(
    /protected backup snapshots/i
  );

  await page.getByLabel('Type "DELETE" to confirm').fill("delete");
  await page.getByLabel("I understand this cannot be undone").check();
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: 'Type "DELETE" exactly' })
  ).toBeVisible();
  expect((await admin.auth.admin.getUserById(user!.id)).data.user?.id).toBe(
    user!.id
  );

  await page.getByLabel('Type "DELETE" to confirm').fill("DELETE");
  await page.getByLabel("I understand this cannot be undone").check();
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
  await expect(page.getByRole("status")).toContainText(
    "Your Little Plate account and active household records were deleted."
  );
  expect((await admin.auth.admin.getUserById(user!.id)).data.user).toBeNull();

  const remaining = execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_mealboard-baby",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-Atc",
      `select
        (select count(*) from public.households where id = '${householdId}')
        + (select count(*) from public.babies where household_id = '${householdId}')
        + (select count(*) from public.product_events where household_id = '${householdId}')`
    ],
    { encoding: "utf8" }
  ).trim();
  expect(remaining).toBe("0");
});
