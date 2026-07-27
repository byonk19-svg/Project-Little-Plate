import { expect, test } from "@playwright/test";

const destinations = [
  { name: "Today", path: "/today", heading: "Today" },
  { name: "Week", path: "/week", heading: "Your week" },
  { name: "Kitchen", path: "/kitchen", heading: "Kitchen" },
  { name: "Foods", path: "/foods", heading: "Foods" }
] as const;

test("the application opens on Today", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/today$/);
  await expect(
    page.getByRole("heading", { name: "Today", level: 1 })
  ).toBeVisible();
});

test("the mobile shell exposes a usable current destination on every route", async ({
  page
}) => {
  for (const destination of destinations) {
    await page.goto(destination.path);

    await expect(
      page.getByRole("heading", { name: destination.heading, level: 1 })
    ).toBeVisible();

    const navigation = page.getByRole("navigation", {
      name: "Primary navigation"
    });
    const currentLink = navigation.getByRole("link", {
      name: new RegExp(`${destination.name}.*Current`)
    });

    await expect(currentLink).toHaveAttribute("aria-current", "page");
    await expect(currentLink.getByText("Current")).toBeVisible();

    for (const link of await navigation.getByRole("link").all()) {
      const box = await link.boundingBox();
      expect(box, "navigation link should have a layout box").not.toBeNull();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(horizontalOverflow).toBe(false);
  }
});

test("a keyboard user can move between primary destinations", async ({
  page
}) => {
  await page.goto("/today");

  const weekLink = page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Week" });

  await weekLink.focus();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/week$/);
  await expect(
    page.getByRole("heading", { name: "Your week", level: 1 })
  ).toBeVisible();
});
