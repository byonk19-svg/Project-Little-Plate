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
      id: "source-e2e-ticket-04",
      publisher: "Synthetic eligibility browser publisher",
      title: "Synthetic eligibility browser source",
      url: "https://example.test/eligibility-browser",
      source_date: "2026-01-01",
      accessed_at: "2026-07-27"
    }
  ],
  tags: [
    {
      id: "skill-e2e-ticket-04",
      kind: "skill",
      label: "Synthetic browser eligibility ability"
    },
    {
      id: "allergen-e2e-ticket-04",
      kind: "allergen",
      label: "Synthetic browser eligibility allergen"
    }
  ],
  foods: [
    {
      id: "food-e2e-ticket-04",
      slug: "aaa-eligibility-browser-food",
      name: "AAA Eligibility Browser Food",
      category: "synthetic-test-fixture"
    }
  ],
  preparations: [
    {
      id: "prep-e2e-ticket-04",
      food_id: "food-e2e-ticket-04",
      slug: "aaa-eligibility-browser-preparation",
      name: "AAA Eligibility Browser Preparation",
      is_active: true
    }
  ],
  revisions: [
    {
      id: "revision-e2e-ticket-04",
      preparation_id: "prep-e2e-ticket-04",
      version: 1,
      status: "approved",
      method: "SYNTHETIC ELIGIBILITY BROWSER METHOD",
      shape_texture: "SYNTHETIC ELIGIBILITY BROWSER TEXTURE",
      source_id: "source-e2e-ticket-04",
      reviewer_role: "synthetic_browser_reviewer",
      reviewed_at: "2026-07-27",
      approved_at: "2026-07-27",
      next_review_at: "2027-07-27",
      tag_ids: ["skill-e2e-ticket-04", "allergen-e2e-ticket-04"],
      visual_required: false,
      visual_ids: [],
      preparation_time_band: "under_15_minutes",
      storage_rules: [
        {
          id: "rule-e2e-ticket-04",
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
  const email = `ticket-04-browser-${crypto.randomUUID()}@example.test`;
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

test("a caregiver configures conservative eligibility and revises it later", async ({
  page,
  request
}) => {
  await createProfile(page, request);

  await page
    .getByRole("link", { name: "Configure feeding eligibility" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Feeding eligibility", level: 1 })
  ).toBeVisible();
  await expect(
    page.getByText(/does not assess or diagnose feeding ability/i)
  ).toBeVisible();

  await page
    .getByLabel("Synthetic browser eligibility ability")
    .selectOption("not_sure");
  await page
    .getByLabel("Safety status for AAA Eligibility Browser Food")
    .selectOption("no_known_restriction");
  await page
    .getByLabel("Exposure state for AAA Eligibility Browser Food")
    .selectOption("unknown");
  await page.getByLabel("Quick backup: AAA Eligibility Browser Food").check();
  await page.getByLabel("New-food pace").selectOption("one_per_week");
  await page
    .getByLabel("Preparation-time preference")
    .selectOption("under_30_minutes");
  await page.getByLabel("Optional prep day").selectOption("6");
  await page.getByRole("button", { name: "Save feeding setup" }).click();
  await expect(page.getByRole("status")).toContainText("Feeding setup saved");

  await page.goto("/foods/aaa-eligibility-browser-preparation");
  const conservativeEligibility = page.getByRole("region", {
    name: "Selection eligibility"
  });
  await expect(conservativeEligibility).toContainText(
    "Required ability is not confirmed"
  );
  await expect(conservativeEligibility).toContainText(
    "does not assess or diagnose"
  );

  await page.goto("/feeding-setup");
  await expect(
    page.getByLabel("Synthetic browser eligibility ability")
  ).toHaveValue("not_sure");
  await page
    .getByLabel("Synthetic browser eligibility ability")
    .selectOption("observed");
  await page.getByRole("button", { name: "Save feeding setup" }).click();
  await expect(page.getByRole("status")).toContainText("Feeding setup saved");

  await page.goto("/foods/aaa-eligibility-browser-preparation");
  await expect(
    page.getByRole("region", { name: "Selection eligibility" })
  ).toContainText("Eligible for selection");

  await page.goto("/feeding-setup");
  await page
    .getByLabel("Safety status for AAA Eligibility Browser Food")
    .selectOption("temporary_avoidance");
  await page.getByRole("button", { name: "Save feeding setup" }).click();
  await expect(page.getByRole("status")).toContainText("Feeding setup saved");

  await page.goto("/foods/aaa-eligibility-browser-preparation");
  await expect(
    page.getByRole("region", { name: "Selection eligibility" })
  ).toContainText("Unavailable because of recorded safety status");

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(horizontalOverflow).toBe(false);
});
