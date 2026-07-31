import { expect, test } from "@playwright/test";

test("a configured local inbox is offered only after a sign-in link request succeeds", async ({
  page
}) => {
  const email = `ticket-22-browser-${crypto.randomUUID()}@example.test`;

  await page.goto("/login");

  await expect(
    page.getByRole("link", { name: "Open local inbox" })
  ).toHaveCount(0);

  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();

  const localInboxLink = page.getByRole("link", {
    name: "Open local inbox"
  });
  await expect(page.getByRole("status")).toContainText(
    "Local development captured the one-time link."
  );
  await expect(localInboxLink).toHaveAttribute(
    "href",
    "http://127.0.0.1:56324"
  );
  await expect(localInboxLink).toHaveAttribute("target", "_blank");
  await expect(localInboxLink).toHaveAttribute("rel", "noreferrer");
  await expect(localInboxLink).not.toHaveAttribute("href", /ticket-22-browser/);
});
