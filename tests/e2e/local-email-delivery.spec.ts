import { expect, test } from "@playwright/test";

test("sign-in keeps the ordinary email guidance when no local inbox is configured", async ({
  page
}) => {
  const email = `ticket-22-absent-${crypto.randomUUID()}@example.test`;

  await page.goto("/login");

  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();

  await expect(page.getByRole("status")).toHaveText(
    "Check your email. Check your email for a secure sign-in link."
  );
  await expect(
    page.getByText("Local development captured the one-time link.")
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Open local inbox" })
  ).toHaveCount(0);
});
