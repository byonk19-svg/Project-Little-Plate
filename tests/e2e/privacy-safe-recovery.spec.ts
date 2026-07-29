import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { readLocalSupabaseStatus } from "../integration/support/local-supabase";
import { waitForMagicLink } from "./support/passwordless-auth";

test("offline feedback rolls back safely and privacy-safe workflow events recover", async ({
  context,
  page,
  request
}) => {
  const status = readLocalSupabaseStatus();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const email = `ticket-15-browser-${crypto.randomUUID()}@example.test`;
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.goto(await waitForMagicLink(request, email));
  await page.getByLabel("Nickname (optional)").fill("Recovery baby");
  await page.getByLabel("Birth date").fill("2025-10-15");
  await page.getByLabel("Time zone").fill("America/Chicago");
  await page.getByLabel("Mixed feeding").check();
  await page.getByLabel("Breakfast").check();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/today$/, { timeout: 20_000 });

  const userList = await admin.auth.admin.listUsers();
  const user = userList.data.users.find(
    (candidate) => candidate.email === email
  );
  expect(user).toBeTruthy();

  await page.getByText("Report workflow friction").click();
  await page
    .getByLabel("What got in the way?")
    .selectOption("network_or_retry");
  await page.getByLabel("Impact").selectOption("blocking");

  await context.setOffline(true);
  await page.getByRole("button", { name: "Send structured feedback" }).click();
  await expect(page.locator(".network-status")).toContainText(
    "You are offline. No change was sent."
  );
  expect(
    (
      await admin
        .from("product_events")
        .select("id")
        .eq("actor_user_id", user!.id)
        .eq("event_name", "feedback_submitted")
    ).data
  ).toEqual([]);

  await context.setOffline(false);
  await expect(
    page.getByText("You are offline. No change was sent.")
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Send structured feedback" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Workflow feedback recorded without notes or clinical details."
  );

  await expect
    .poll(async () => {
      const events = await admin
        .from("product_events")
        .select(
          "event_name,outcome,reason_code,operation,state,duration_bucket,workflow,friction_code,severity"
        )
        .eq("actor_user_id", user!.id)
        .order("occurred_at");
      return events.data;
    })
    .toEqual([
      {
        event_name: "today_opened",
        outcome: null,
        reason_code: null,
        operation: null,
        state: "empty",
        duration_bucket: null,
        workflow: null,
        friction_code: null,
        severity: null
      },
      {
        event_name: "feedback_submitted",
        outcome: null,
        reason_code: null,
        operation: null,
        state: null,
        duration_bucket: null,
        workflow: "today",
        friction_code: "network_or_retry",
        severity: "blocking"
      }
    ]);

  expect((await admin.auth.admin.deleteUser(user!.id)).error).toBeNull();
});
