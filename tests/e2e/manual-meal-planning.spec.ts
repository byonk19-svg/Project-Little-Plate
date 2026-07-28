import { execSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";
import {
  expect,
  test,
  type APIRequestContext,
  type Page
} from "@playwright/test";

import { waitForMagicLink } from "./support/passwordless-auth";

const fixture = {
  sources: [
    {
      id: "source-e2e-ticket-05",
      publisher: "Synthetic planning browser publisher",
      title: "Synthetic planning browser source",
      url: "https://example.test/planning-browser",
      source_date: "2026-01-01",
      accessed_at: "2026-07-27"
    }
  ],
  tags: [
    {
      id: "skill-e2e-ticket-05",
      kind: "skill",
      label: "Synthetic browser planning ability"
    },
    {
      id: "allergen-e2e-ticket-05",
      kind: "allergen",
      label: "Synthetic browser planning allergen"
    }
  ],
  foods: [
    {
      id: "food-e2e-ticket-05",
      slug: "aaa-planning-browser-food",
      name: "AAA Planning Browser Food",
      category: "synthetic-test-fixture"
    }
  ],
  preparations: [
    {
      id: "prep-e2e-ticket-05",
      food_id: "food-e2e-ticket-05",
      slug: "aaa-planning-browser-preparation",
      name: "AAA Planning Browser Preparation",
      is_active: true
    }
  ],
  revisions: [
    {
      id: "revision-e2e-ticket-05",
      preparation_id: "prep-e2e-ticket-05",
      version: 1,
      status: "approved",
      method: "SYNTHETIC PLANNING BROWSER METHOD",
      shape_texture: "SYNTHETIC PLANNING BROWSER TEXTURE",
      source_id: "source-e2e-ticket-05",
      reviewer_role: "synthetic_browser_reviewer",
      reviewed_at: "2026-07-27",
      approved_at: "2026-07-27",
      next_review_at: "2027-07-27",
      tag_ids: ["skill-e2e-ticket-05", "allergen-e2e-ticket-05"],
      storage_rules: [
        {
          id: "rule-e2e-ticket-05",
          support_status: "unsupported",
          deadline_kind: null,
          duration_hours: null,
          guidance: null
        }
      ]
    }
  ],
  retirements: []
} as const;

async function createProfile(
  page: Page,
  request: APIRequestContext
): Promise<void> {
  const email = `ticket-05-browser-${crypto.randomUUID()}@example.test`;
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.goto(await waitForMagicLink(request, email));
  await page.getByLabel("Nickname (optional)").fill("Juniper");
  await page.getByLabel("Birth date").fill("2025-10-15");
  await page.getByLabel("Time zone").fill("America/Chicago");
  await page.getByLabel("Mixed feeding").check();
  await page.getByLabel("Breakfast").check();
  await page.getByLabel("Dinner").check();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/today$/, { timeout: 20_000 });
}

test.beforeAll(async () => {
  const status = JSON.parse(
    execSync("pnpm exec supabase status -o json", { encoding: "utf8" })
  ) as { API_URL: string; SERVICE_ROLE_KEY: string };
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const result = await admin.rpc("import_catalog_fixture", {
    p_fixture: fixture
  });
  expect(result.error).toBeNull();
});

test("a caregiver adds an eligible reviewed preparation from Foods to tomorrow in Week", async ({
  page,
  request
}) => {
  test.setTimeout(120_000);
  await createProfile(page, request);

  await page.goto("/feeding-setup");
  await page
    .getByLabel("Synthetic browser planning ability")
    .selectOption("observed");
  await page
    .getByLabel("Safety status for AAA Planning Browser Food")
    .selectOption("no_known_restriction");
  await page.getByLabel("New-food pace").selectOption("one_per_week");
  await page
    .getByLabel("Preparation-time preference")
    .selectOption("under_30_minutes");
  await page.getByRole("button", { name: "Save feeding setup" }).click();
  await expect(page.getByRole("status")).toContainText("Feeding setup saved");

  await page.goto("/foods");
  await page.waitForLoadState("networkidle");
  const preparationLink = page.getByRole("link", {
    name: /AAA Planning Browser Preparation/
  });
  await expect(preparationLink).toHaveAttribute(
    "href",
    "/foods/aaa-planning-browser-preparation"
  );
  await page.goto("/foods/aaa-planning-browser-preparation");
  await expect(page).toHaveURL(/\/foods\/aaa-planning-browser-preparation$/, {
    timeout: 20_000
  });
  await expect(
    page.getByRole("region", { name: "Selection eligibility" })
  ).toContainText("Eligible for selection");

  await page.getByLabel("Tomorrow's meal slot").selectOption("dinner");
  await page.getByRole("button", { name: "Add to tomorrow's meal" }).click();

  await expect(page).toHaveURL(/\/week\?planned=1$/);
  await expect(
    page.getByRole("heading", { name: "Your week", level: 1 })
  ).toBeVisible();
  await expect(page.getByTestId("week-day")).toHaveCount(7);

  const tomorrow = page.getByTestId("week-day").filter({ hasText: "Tomorrow" });
  await expect(tomorrow.getByRole("heading", { name: "Dinner" })).toBeVisible();
  await expect(tomorrow).toContainText("AAA Planning Browser Preparation");
  await expect(tomorrow).toContainText("AAA Planning Browser Food");

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(horizontalOverflow).toBe(false);
});
