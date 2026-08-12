import {
  expect,
  test,
  type APIRequestContext,
  type Page
} from "@playwright/test";

import { waitForMagicLink } from "./support/passwordless-auth";

async function signIn(page: Page, request: APIRequestContext) {
  const email = `recipe-browser-${crypto.randomUUID()}@example.test`;
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.goto(await waitForMagicLink(request, email));
  await expect(page).toHaveURL(/\/today$/, { timeout: 20_000 });
}

test("the private recipe workflow works on a narrow mobile viewport", async ({
  page,
  request
}) => {
  test.setTimeout(120_000);
  await signIn(page, request);

  await expect(
    page.getByRole("heading", { name: "Today", level: 1 })
  ).toBeVisible();
  await expect(page.getByText("Nothing planned yet")).toBeVisible();

  await page.goto("/recipes/new");
  await page.getByLabel("Title").fill("Weeknight Oatmeal");
  await page.getByLabel("Ingredients").fill("Oats\nMilk\nBanana");
  await page.getByLabel("Instructions").fill("Cook oats.\nTop with banana.");
  await page.getByLabel("Tags (optional)").fill("quick, breakfast");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]+\?created=1$/);
  await expect(
    page.getByRole("heading", { name: "Weeknight Oatmeal", level: 1 })
  ).toBeVisible();

  const recipeId = page.url().match(/\/recipes\/([0-9a-f-]+)/)?.[1];
  expect(recipeId).toBeTruthy();

  await page.getByRole("button", { name: "Favorite" }).click();
  await expect(page.getByRole("button", { name: "Unfavorite" })).toBeVisible();

  await page.goto("/week");
  await expect(page.getByTestId("week-day")).toHaveCount(7);
  const firstBreakfast = page
    .getByTestId("week-day")
    .first()
    .getByTestId("week-slot")
    .filter({ hasText: "Breakfast" });
  await firstBreakfast
    .getByRole("combobox")
    .selectOption({ label: "Weeknight Oatmeal" });
  await firstBreakfast.getByRole("button", { name: "Plan recipe" }).click();
  await expect(page).toHaveURL(/\/week\?.*saved=1/);
  await expect(firstBreakfast).toContainText("Weeknight Oatmeal");

  await page.goto(`/week?recipeId=${recipeId}`);
  await expect(
    page.locator(`select[name="recipeId"] option:checked[value="${recipeId}"]`)
  ).toHaveCount(1);

  await page.goto("/today");
  await expect(
    page.getByRole("heading", { name: "Weeknight Oatmeal", level: 2 })
  ).toBeVisible();
  await expect(page.getByText("Open recipe")).toBeVisible();

  await page.goto("/kitchen");
  await page.getByLabel("Recipe").selectOption({ label: "Weeknight Oatmeal" });
  await page.getByLabel("Portions (optional)").fill("2");
  await page
    .getByLabel("Notes (optional)")
    .fill("Made before the busy morning.");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page).toHaveURL(/\/kitchen\?saved=1$/);
  await expect(page.getByText("Made before the busy morning.")).toBeVisible();

  await page.goto("/recipes");
  await expect(
    page.getByRole("heading", { name: "Weeknight Oatmeal", level: 2 })
  ).toBeVisible();
  await page.getByRole("link", { name: "Weeknight Oatmeal" }).click();
  await page
    .getByLabel("Or use an approved image URL")
    .fill("https://example.com/oatmeal.webp");
  await page
    .getByLabel("Alternative text")
    .last()
    .fill("A bowl of oatmeal with banana");
  await page.getByRole("button", { name: "Save image URL" }).click();
  await expect(page).toHaveURL(/imageSaved=1/);
  await expect(
    page.getByAltText("A bowl of oatmeal with banana")
  ).toBeVisible();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    )
  ).toBe(false);
});

test("signed-out navigation names the active recipe product", async ({
  page
}) => {
  await page.goto("/recipes");
  await expect(
    page.getByRole("heading", { name: "Recipes", level: 1 })
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Recipes" })
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Foods" })
  ).toHaveCount(0);
});
