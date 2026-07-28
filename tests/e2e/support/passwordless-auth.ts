import { expect, type APIRequestContext } from "@playwright/test";

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

export async function waitForMagicLink(
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
