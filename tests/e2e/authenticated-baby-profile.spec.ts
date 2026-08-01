import { expect, test } from "@playwright/test";

import { waitForMagicLink } from "./support/passwordless-auth";

test("a caregiver signs in without a password and creates a baby profile", async ({
  page,
  request
}) => {
  const email = `ticket-02-browser-${crypto.randomUUID()}@example.test`;

  await page.goto("/");
  await page.getByRole("link", { name: "Set up caregiver account" }).click();

  await expect(
    page.getByRole("heading", { name: "Sign in to Little Plate", level: 1 })
  ).toBeVisible();
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();

  await expect(page.getByText("Check your email")).toBeVisible();

  const magicLink = await waitForMagicLink(request, email);
  let callbackUrl = "";
  page.on("request", (browserRequest) => {
    if (new URL(browserRequest.url()).pathname === "/auth/callback") {
      callbackUrl = browserRequest.url();
    }
  });
  await page.goto(magicLink);

  await expect(page).toHaveURL(/\/profile-setup$/);
  await expect(
    page.getByRole("heading", { name: "Tell us about your baby", level: 1 })
  ).toBeVisible();

  expect(callbackUrl).not.toBe("");
  await page.goto(callbackUrl);
  await expect(page).toHaveURL(/\/profile-setup$/);
  await expect(
    page.getByRole("heading", { name: "Tell us about your baby", level: 1 })
  ).toBeVisible();

  await expect(
    page.getByText(
      /preparation options use feeding skills, not birthday alone/i
    )
  ).toBeVisible();

  await page.getByLabel("Nickname (optional)").fill("Juniper");
  await page.getByLabel("Birth date").fill("2025-10-15");
  await page.getByLabel("Time zone").fill("America/Chicago");
  await page.getByLabel("Mixed feeding").check();
  await page.getByLabel("Breakfast").check();
  await page.getByLabel("Dinner").check();
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page).toHaveURL(/\/today$/);
  await expect(
    page.getByRole("heading", { name: "Today", level: 1 })
  ).toBeVisible();
  await expect(page.getByText("Juniper’s profile is ready.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Set up caregiver account" })
  ).toHaveCount(0);

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(horizontalOverflow).toBe(false);
});
