import { execSync } from "node:child_process";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  expect,
  test,
  type APIRequestContext,
  type Page
} from "@playwright/test";

import { waitForMagicLink } from "./support/passwordless-auth";

let admin: SupabaseClient;
const createdUserIds: string[] = [];

async function createProfile(
  page: Page,
  request: APIRequestContext
): Promise<void> {
  const status = JSON.parse(
    execSync("pnpm exec supabase status -o json", { encoding: "utf8" })
  ) as { API_URL: string; SERVICE_ROLE_KEY: string };
  const email = `personal-recipe-browser-${crypto.randomUUID()}@example.test`;
  const bootstrap = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.goto(await waitForMagicLink(request, email));
  await page.getByLabel("Nickname (optional)").fill("Recipe baby");
  await page.getByLabel("Birth date").fill("2025-10-15");
  await page.getByLabel("Time zone").fill("America/Chicago");
  await page.getByLabel("Mixed feeding").check();
  await page.getByLabel("Breakfast").check();
  await page.getByLabel("Lunch").check();
  await page.getByLabel("Dinner").check();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/today$/);

  const users = await bootstrap.auth.admin.listUsers();
  const user = users.data.users.find((candidate) => candidate.email === email);
  if (user) createdUserIds.push(user.id);
}

test.beforeAll(async () => {
  const status = JSON.parse(
    execSync("pnpm exec supabase status -o json", { encoding: "utf8" })
  ) as { API_URL: string; SERVICE_ROLE_KEY: string };
  admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
});

test.afterAll(async () => {
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }
});

test("a household can save a personal recipe and place it anywhere in the current week", async ({
  page,
  request
}) => {
  await createProfile(page, request);

  await page.goto("/recipes/new");
  await page.getByLabel("Food or recipe name").fill("Banana oats");
  await page.getByLabel("Ingredients or food description").fill("Banana\nOats");
  await page
    .getByLabel("Instructions or preparation notes")
    .fill("Mix together.");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]+$/);
  await expect(page.getByText("Personal recipe — not reviewed")).toBeVisible();

  await page.getByLabel("Week day").selectOption({ index: 2 });
  await page.getByLabel("Meal slot").selectOption("dinner");
  await page.getByRole("button", { name: "Add to this week" }).click();
  await expect(page).toHaveURL(/\/week\?planned=personal$/);

  await expect(page.getByText("Banana oats")).toBeVisible();
  await expect(
    page.getByText("This household recipe is for planning only.")
  ).toBeVisible();

  await page.goto("/today");
  await expect(page.getByText("Banana oats")).toHaveCount(0);
  await page.goto("/kitchen");
  await expect(page.getByText("Banana oats")).toHaveCount(0);
});
