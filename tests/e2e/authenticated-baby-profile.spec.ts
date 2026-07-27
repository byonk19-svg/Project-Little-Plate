import { expect, test, type APIRequestContext } from "@playwright/test";

type MailpitMessageSummary = {
  ID: string;
  To: Array<{ Address: string }>;
};

type MailpitMessages = {
  messages: MailpitMessageSummary[];
};

type MailpitMessage = {
  HTML: string;
  Text: string;
};

async function waitForMagicLink(
  request: APIRequestContext,
  email: string
): Promise<string> {
  await expect
    .poll(
      async () => {
        const response = await request.get(
          "http://127.0.0.1:56324/api/v1/messages"
        );
        const mailbox = (await response.json()) as MailpitMessages;

        return mailbox.messages.find((message) =>
          message.To.some((recipient) => recipient.Address === email)
        )?.ID;
      },
      { timeout: 15_000 }
    )
    .toBeTruthy();

  const mailboxResponse = await request.get(
    "http://127.0.0.1:56324/api/v1/messages"
  );
  const mailbox = (await mailboxResponse.json()) as MailpitMessages;
  const messageId = mailbox.messages.find((message) =>
    message.To.some((recipient) => recipient.Address === email)
  )!.ID;
  const messageResponse = await request.get(
    `http://127.0.0.1:56324/api/v1/message/${messageId}`
  );
  const message = (await messageResponse.json()) as MailpitMessage;
  const match = `${message.HTML}\n${message.Text}`.match(
    /https?:\/\/[^\s"'<>]+/
  );

  expect(match, "passwordless email should contain a link").not.toBeNull();
  return match![0].replaceAll("&amp;", "&");
}

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
