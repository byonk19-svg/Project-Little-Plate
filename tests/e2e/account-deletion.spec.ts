import { execFileSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { readLocalSupabaseStatus } from "../integration/support/local-supabase";
import { waitForMagicLink } from "./support/passwordless-auth";

test("a caregiver reviews retention, confirms deletion, and loses account access", async ({
  page,
  request
}) => {
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
