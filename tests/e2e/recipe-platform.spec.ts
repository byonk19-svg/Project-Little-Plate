import {
  expect,
  test,
  type APIRequestContext,
  type Page
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { waitForMagicLink } from "./support/passwordless-auth";

const singleImportUrl = "https://example.com/.little-plate-test-fixture/single";
const multiImportUrl = "https://example.com/.little-plate-test-fixture/multi";
const incompleteImportUrl =
  "https://example.com/.little-plate-test-fixture/incomplete";

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
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]+\?created=1$/, {
    timeout: 20_000
  });
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
  await page.getByRole("button", { name: "Archive note" }).click();
  await expect(page).toHaveURL(/\/kitchen\?archived=1$/);
  await expect(page.getByText("Kitchen note archived.")).toBeVisible();

  await page.goto("/recipes?q=does-not-exist");
  await expect(
    page.getByRole("heading", { name: "No matching recipes", level: 2 })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Clear filters" })
  ).toHaveAttribute("href", "/recipes");

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
  await expect(page.getByText("Cover image saved.")).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Recipe image unavailable" })
  ).toBeVisible();

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Remove image" }).click();
  await expect(
    page.getByRole("status", { name: "Recipe image unavailable" })
  ).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove image" }).click();
  await expect(page.getByText("Cover image removed.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save image URL" })
  ).toBeVisible();

  await page.goto("/recipes");
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: "Weeknight Oatmeal" })
      .locator("img")
  ).toHaveCount(0);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    )
  ).toBe(false);

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.goto(`/recipes/${recipeId}`);
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]+$/);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/recipes\?deleted=1$/);
  await expect(
    page.getByRole("heading", { name: "Weeknight Oatmeal", level: 2 })
  ).toHaveCount(0);
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

  await page.goto("/recipes/00000000-0000-0000-0000-000000000000/edit");
  await expect(page).toHaveURL(/\/login$/);
});

test("active signed-out routes have no serious accessibility violations", async ({
  page
}) => {
  for (const path of [
    "/login",
    "/recipes",
    "/recipes/import",
    "/today",
    "/week",
    "/kitchen"
  ]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    const seriousViolations = results.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? "")
    );
    expect(seriousViolations, `${path} accessibility violations`).toEqual([]);
  }
});

test("edits a saved recipe from its detail page", async ({ page, request }) => {
  test.setTimeout(120_000);
  await signIn(page, request);

  await page.goto("/recipes/new");
  await page.getByLabel("Title").fill("Editable Dogfood Recipe");
  await page.getByLabel("Ingredients").fill("Ingredient one");
  await page.getByLabel("Instructions").fill("Do the thing.");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]+\?created=1$/);

  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]+\/edit$/);
  await expect(
    page.getByRole("heading", { name: "Edit Editable Dogfood Recipe" })
  ).toBeVisible();
  await page
    .getByLabel("Short description (optional)")
    .fill("Updated during the edit flow.");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]+\?updated=1$/);
  await expect(page.getByText("Updated during the edit flow.")).toBeVisible();
});

test("imports and edits a recipe with explicit image confirmation", async ({
  page,
  request
}) => {
  test.setTimeout(120_000);
  await signIn(page, request);

  await page.goto("/recipes/import");
  await page.getByLabel("Recipe website link").fill(singleImportUrl);
  await page.getByRole("button", { name: "Preview recipe" }).click();

  await expect(
    page.getByRole("heading", { name: "Imported details are editable" })
  ).toBeVisible();
  await page.getByLabel("Title").fill("Edited Fixture Oat Bites");
  await expect(page.getByLabel("Use this image")).not.toBeChecked();
  await page.getByLabel("Image description").fill("Oat bites on a plate");
  await page.getByLabel("Use this image").check();
  await page.getByRole("button", { name: "Save imported recipe" }).click();

  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]+\?created=1$/);
  await expect(
    page.getByRole("heading", { name: "Edited Fixture Oat Bites", level: 1 })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "example.com" })).toHaveAttribute(
    "href",
    singleImportUrl
  );
  await expect(page.getByText("External image link")).toBeVisible();

  await page.goto("/recipes/import");
  await page.getByLabel("Recipe website link").fill(incompleteImportUrl);
  await page.getByRole("button", { name: "Preview recipe" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "could not find complete recipe details" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Add it manually" })
  ).toHaveAttribute("href", "/recipes/new");
});

test("selects recipes from an article and handles duplicate imports explicitly", async ({
  page,
  request
}) => {
  test.setTimeout(120_000);
  await signIn(page, request);

  await page.goto("/recipes/import");
  await page.getByLabel("Recipe website link").fill(multiImportUrl);
  await page.getByRole("button", { name: "Preview recipe" }).click();

  await expect(
    page.getByRole("heading", { name: "Choose recipes to save" })
  ).toBeVisible();
  const saveChoices = page.getByRole("checkbox", { name: "Save this recipe" });
  await expect(saveChoices).toHaveCount(2);
  await saveChoices.nth(1).uncheck();
  const imageChoices = page.getByRole("checkbox", { name: "Use this image" });
  await expect(imageChoices).toHaveCount(2);
  await expect(imageChoices.nth(0)).not.toBeChecked();
  await imageChoices.nth(0).check();
  await page.getByRole("button", { name: "Save selected recipes" }).click();

  await expect(page).toHaveURL(/\/recipes\?imported=1$/, {
    timeout: 20_000
  });
  await expect(
    page.getByRole("heading", { name: "Fixture Spinach Bites", level: 2 })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Fixture Banana Oat Cups", level: 2 })
  ).toHaveCount(0);

  await page.goto("/recipes/import");
  await page.getByLabel("Recipe website link").fill(multiImportUrl);
  await page.getByRole("button", { name: "Preview recipe" }).click();
  await expect(page.getByText("Already saved")).toHaveCount(2);
  const separateCopies = page.getByRole("checkbox", {
    name: "Import separate copy"
  });
  await expect(separateCopies).toHaveCount(2);
  await expect(separateCopies.nth(0)).not.toBeChecked();
  await separateCopies.nth(0).check();
  await separateCopies.nth(1).uncheck();
  await page.getByRole("button", { name: "Save selected recipes" }).click();

  await expect(page).toHaveURL(/\/recipes\?imported=1$/, {
    timeout: 20_000
  });
  await expect(
    page.getByRole("heading", { name: "Fixture Spinach Bites", level: 2 })
  ).toHaveCount(2);
  await expect(
    page.getByRole("heading", { name: "Fixture Banana Oat Cups", level: 2 })
  ).toHaveCount(0);
});
