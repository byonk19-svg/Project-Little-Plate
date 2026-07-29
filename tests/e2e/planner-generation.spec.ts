import { spawn } from "node:child_process";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  expect,
  test,
  type APIRequestContext,
  type Page
} from "@playwright/test";

import { readLocalSupabaseStatus } from "../integration/support/local-supabase";
import { waitForMagicLink } from "./support/passwordless-auth";

const fixture = {
  sources: [
    {
      id: "source-e2e-ticket-14",
      publisher: "Synthetic planner browser publisher",
      title: "Synthetic planner browser source",
      url: "https://example.test/planner-generation",
      source_date: "2026-01-01",
      accessed_at: "2026-07-28"
    }
  ],
  tags: [
    {
      id: "skill-e2e-ticket-14",
      kind: "skill",
      label: "Synthetic planner generation ability"
    },
    {
      id: "allergen-e2e-ticket-14",
      kind: "allergen",
      label: "Synthetic planner generation allergen"
    }
  ],
  foods: [
    {
      id: "food-e2e-ticket-14",
      slug: "planner-generation-food",
      name: "Planner Generation Food",
      category: "synthetic-test-fixture"
    }
  ],
  preparations: [
    {
      id: "prep-e2e-ticket-14",
      food_id: "food-e2e-ticket-14",
      slug: "planner-generation-preparation",
      name: "Planner Generation Preparation",
      is_active: true
    }
  ],
  revisions: [
    {
      id: "revision-e2e-ticket-14",
      preparation_id: "prep-e2e-ticket-14",
      version: 1,
      status: "approved",
      method: "SYNTHETIC PLANNER GENERATION METHOD",
      shape_texture: "SYNTHETIC PLANNER GENERATION TEXTURE",
      source_id: "source-e2e-ticket-14",
      reviewer_role: "synthetic_browser_reviewer",
      reviewed_at: "2026-07-28",
      approved_at: "2026-07-28",
      next_review_at: "2027-07-28",
      tag_ids: ["skill-e2e-ticket-14", "allergen-e2e-ticket-14"],
      visual_required: false,
      visual_ids: [],
      preparation_time_band: "under_15_minutes",
      storage_rules: [
        {
          id: "rule-e2e-ticket-14",
          support_status: "supported",
          deadline_kind: "discard_after",
          duration_hours: 240,
          guidance: "SYNTHETIC TEST-ONLY STORAGE GUIDANCE"
        }
      ]
    }
  ],
  retirements: []
} as const;

async function createProfile(
  page: Page,
  request: APIRequestContext
): Promise<string> {
  const email = `ticket-14-browser-${crypto.randomUUID()}@example.test`;
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.goto(await waitForMagicLink(request, email));
  await page.getByLabel("Nickname (optional)").fill("Planner baby");
  await page.getByLabel("Birth date").fill("2025-10-15");
  await page.getByLabel("Time zone").fill("America/Chicago");
  await page.getByLabel("Mixed feeding").check();
  await page.getByLabel("Breakfast").check();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/today$/, { timeout: 20_000 });
  return email;
}

async function holdBabyRows() {
  const child = spawn(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_mealboard-baby",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1"
    ],
    { stdio: ["pipe", "pipe", "pipe"] }
  );
  const ready = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out acquiring planner browser lock")),
      10_000
    );
    child.stdout.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("ticket-14-browser-lock")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.on("error", reject);
  });
  child.stdin.write(`
    begin;
    select id from public.babies where is_active for update;
    select 'ticket-14-browser-lock';
  `);
  await ready;
  return () => child.stdin.end("commit;\n");
}

let admin: SupabaseClient;

test.beforeAll(async () => {
  const status = readLocalSupabaseStatus();
  admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  expect(
    (await admin.rpc("import_catalog_fixture", { p_fixture: fixture })).error
  ).toBeNull();
  expect(
    (
      await admin.rpc("import_storage_rule_profiles", {
        p_profiles: [
          {
            id: "profile-e2e-ticket-14",
            storage_rule_id: "rule-e2e-ticket-14",
            content_revision_id: "revision-e2e-ticket-14",
            storage_location: "refrigerator",
            start_event_kind: "prepared_or_opened",
            precedence: 0,
            duration_min_hours: 240,
            duration_max_hours: 240,
            source_id: "source-e2e-ticket-14",
            reviewer_role: "synthetic_browser_reviewer",
            reviewed_at: "2026-07-28",
            approved_at: "2026-07-28",
            next_review_at: "2027-07-28"
          }
        ]
      })
    ).error
  ).toBeNull();
});

test("a caregiver generates, understands, locks, regenerates, and recovers from failure", async ({
  page,
  request
}) => {
  test.setTimeout(180_000);
  const email = await createProfile(page, request);
  await page.goto("/feeding-setup");
  await page
    .getByLabel("Synthetic planner generation ability")
    .selectOption("observed");
  await page
    .getByLabel("Safety status for Planner Generation Food")
    .selectOption("no_known_restriction");
  await page
    .getByLabel("Exposure state for Planner Generation Food")
    .selectOption("liked");
  await page.getByLabel("New-food pace").selectOption("one_per_week");
  await page
    .getByLabel("Preparation-time preference")
    .selectOption("under_30_minutes");
  await page.getByRole("button", { name: "Save feeding setup" }).click();
  await expect(page.getByRole("status")).toContainText("Feeding setup saved");

  await page.goto("/week");
  const release = await holdBabyRows();
  await page.getByRole("button", { name: "Generate a reviewed week" }).click({
    noWaitAfter: true
  });
  await expect(
    page.getByRole("button", { name: "Checking the complete week..." })
  ).toBeDisabled();
  release();
  await expect(page).toHaveURL(/generated=1/, { timeout: 30_000 });
  await expect(page.getByRole("status")).toContainText(
    "complete feasible week was committed"
  );
  await expect(page.getByTestId("week-component")).toHaveCount(7);
  await expect(
    page.getByRole("region", { name: "Important planning reasons" })
  ).toContainText("Adds preparation work");

  const first = page.getByTestId("week-component").first();
  await first.locator("summary", { hasText: "Edit component" }).click();
  await first.getByRole("button", { name: "Lock component" }).click();
  await expect(page).toHaveURL(/edited=set_component_lock/, {
    timeout: 15_000
  });
  await expect(page.getByTestId("week-component").first()).toContainText(
    "Component locked"
  );

  await page
    .getByRole("button", { name: "Regenerate unlocked choices" })
    .click();
  await expect(page).toHaveURL(/generated=1/, { timeout: 30_000 });
  await expect(page.getByTestId("week-component").first()).toContainText(
    "Component locked"
  );

  const secondMeal = page.locator("article").nth(1);
  const secondMealChoice = await secondMeal
    .getByTestId("week-component")
    .first()
    .locator("strong")
    .innerText();
  await secondMeal.locator("summary", { hasText: "Edit meal" }).click();
  await secondMeal.getByRole("button", { name: "Lock meal" }).click();
  await expect(page).toHaveURL(/edited=set_meal_lock/, { timeout: 15_000 });
  await expect(page.locator("article").nth(1)).toContainText("Meal locked");
  await page
    .getByRole("button", { name: "Regenerate unlocked choices" })
    .click();
  await expect(page).toHaveURL(/generated=1/, { timeout: 30_000 });
  await expect(
    page.locator("article").nth(1).getByTestId("week-component").first()
  ).toContainText(secondMealChoice);

  await page.goto("/feeding-setup");
  await page
    .getByLabel("Safety status for Planner Generation Food")
    .selectOption("temporary_avoidance");
  await page.getByRole("button", { name: "Save feeding setup" }).click();
  await page.goto("/week");
  await page
    .getByRole("button", { name: "Regenerate unlocked choices" })
    .click();
  await expect(
    page.locator(".planner-generation").getByRole("alert")
  ).toContainText("No reviewed preparation currently matches");
  await expect(page.getByTestId("week-component")).toHaveCount(7);

  const user = (await admin.auth.admin.listUsers()).data.users.find(
    (candidate) => candidate.email === email
  );
  expect(user).toBeTruthy();
  await expect
    .poll(async () => {
      const result = await admin
        .from("product_events")
        .select("event_name,operation,outcome,reason_code")
        .eq("actor_user_id", user!.id)
        .in("event_name", ["generation_outcome", "generation_failed"])
        .order("occurred_at");
      return result.data;
    })
    .toEqual([
      {
        event_name: "generation_outcome",
        operation: "generate",
        outcome: "success",
        reason_code: null
      },
      {
        event_name: "generation_outcome",
        operation: "regenerate",
        outcome: "success",
        reason_code: null
      },
      {
        event_name: "generation_outcome",
        operation: "regenerate",
        outcome: "success",
        reason_code: null
      },
      {
        event_name: "generation_failed",
        operation: "regenerate",
        outcome: "rejected",
        reason_code: "no_eligible_candidate"
      }
    ]);
});
