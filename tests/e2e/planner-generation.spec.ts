import { spawn } from "node:child_process";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  expect,
  test,
  type APIRequestContext,
  type Page
} from "@playwright/test";

import { readLocalSupabaseStatus } from "../integration/support/local-supabase";
import { publishCatalogFixtureForTest } from "../integration/support/catalog-publication";
import { waitForMagicLink } from "./support/passwordless-auth";

function plannerFixture(suffix: string) {
  const sourceId = `source-e2e-planner-${suffix}`;
  const skillId = `skill-e2e-planner-${suffix}`;
  const allergenId = `allergen-e2e-planner-${suffix}`;
  const foodId = `food-e2e-planner-${suffix}`;
  const preparationId = `prep-e2e-planner-${suffix}`;
  const revisionId = `revision-e2e-planner-${suffix}`;
  const ruleId = `rule-e2e-planner-${suffix}`;

  return {
    catalog: {
      sources: [
        {
          id: sourceId,
          publisher: "Synthetic planner browser publisher",
          title: "Synthetic planner browser source",
          url: "https://example.test/planner-generation",
          source_date: "2026-01-01",
          accessed_at: "2026-07-28"
        }
      ],
      tags: [
        {
          id: skillId,
          kind: "skill",
          label: "Synthetic planner generation ability"
        },
        {
          id: allergenId,
          kind: "allergen",
          label: "Synthetic planner generation allergen"
        }
      ],
      foods: [
        {
          id: foodId,
          slug: `planner-generation-food-${suffix}`,
          name: "Planner Generation Food",
          category: "synthetic-test-fixture"
        }
      ],
      preparations: [
        {
          id: preparationId,
          food_id: foodId,
          slug: `planner-generation-preparation-${suffix}`,
          name: "Planner Generation Preparation",
          is_active: true
        }
      ],
      revisions: [
        {
          id: revisionId,
          preparation_id: preparationId,
          version: 1,
          status: "approved",
          method: "SYNTHETIC PLANNER GENERATION METHOD",
          shape_texture: "SYNTHETIC PLANNER GENERATION TEXTURE",
          source_id: sourceId,
          reviewer_role: "synthetic_browser_reviewer",
          reviewed_at: "2026-07-28",
          approved_at: "2026-07-28",
          next_review_at: "2027-07-28",
          tag_ids: [skillId, allergenId],
          visual_required: false,
          visual_ids: [],
          preparation_time_band: "under_15_minutes",
          storage_rules: [
            {
              id: ruleId,
              support_status: "supported",
              deadline_kind: "discard_after",
              duration_hours: 240,
              guidance: "SYNTHETIC TEST-ONLY STORAGE GUIDANCE"
            }
          ]
        }
      ],
      retirements: []
    },
    revisionId,
    storageProfile: {
      id: `profile-e2e-planner-${suffix}`,
      storage_rule_id: ruleId,
      content_revision_id: revisionId,
      storage_location: "refrigerator",
      start_event_kind: "prepared_or_opened",
      precedence: 0,
      duration_min_hours: 240,
      duration_max_hours: 240,
      source_id: sourceId,
      reviewer_role: "synthetic_browser_reviewer",
      reviewed_at: "2026-07-28",
      approved_at: "2026-07-28",
      next_review_at: "2027-07-28"
    }
  };
}

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
let catalogReader: SupabaseClient;

test.beforeAll(async () => {
  const status = readLocalSupabaseStatus();
  admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  catalogReader = createClient(status.API_URL, status.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
});

async function importPlannerFixture(): Promise<string> {
  const fixture = plannerFixture(crypto.randomUUID());
  await publishCatalogFixtureForTest(admin, fixture.catalog);
  expect(
    (
      await admin.rpc("import_storage_rule_profiles", {
        p_profiles: [fixture.storageProfile]
      })
    ).error
  ).toBeNull();
  return fixture.revisionId;
}

async function unretiredApprovedRevisionIds(): Promise<string[]> {
  const [revisions, retirements] = await Promise.all([
    admin.from("content_revisions").select("id").eq("status", "approved"),
    admin.from("content_retirements").select("revision_id")
  ]);
  expect(revisions.error).toBeNull();
  expect(retirements.error).toBeNull();
  const retiredIds = new Set(
    (retirements.data ?? []).map(({ revision_id: revisionId }) => revisionId)
  );
  return (revisions.data ?? [])
    .map(({ id }) => id)
    .filter((revisionId) => !retiredIds.has(revisionId))
    .sort();
}

async function expectPublishedPreparationCount(count: number): Promise<void> {
  const result = await catalogReader.rpc("list_published_preparations");
  expect(result.error).toBeNull();
  expect(result.data).toHaveLength(count);
}

async function retireRevisions(
  revisionIds: string[],
  reason: string
): Promise<void> {
  if (revisionIds.length === 0) return;
  const result = await admin.from("content_retirements").insert(
    revisionIds.map((revisionId) => ({
      revision_id: revisionId,
      retired_at: "2026-07-30",
      reason
    }))
  );
  expect(result.error).toBeNull();
}

async function retirePublishedPreparations(reason: string): Promise<void> {
  await retireRevisions(await unretiredApprovedRevisionIds(), reason);
  expect(await unretiredApprovedRevisionIds()).toEqual([]);
  await expectPublishedPreparationCount(0);
}

async function configurePlannerEligibility(page: Page): Promise<void> {
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
}

test("no eligible reviewed preparations leaves Week visible with safe recovery links", async ({
  page,
  request
}) => {
  test.setTimeout(120_000);
  await retirePublishedPreparations(
    "SYNTHETIC PLANNER EMPTY-CATALOG TEST ISOLATION"
  );
  const revisionId = await importPlannerFixture();
  expect(await unretiredApprovedRevisionIds()).toEqual([revisionId]);
  await expectPublishedPreparationCount(1);
  await createProfile(page, request);
  await configurePlannerEligibility(page);

  await page.goto("/week");
  await expect(
    page.getByRole("button", { name: "Generate a reviewed week" })
  ).toBeEnabled();

  await retireRevisions(
    [revisionId],
    "SYNTHETIC PLANNER EMPTY-CATALOG TEST CONDITION"
  );
  expect(await unretiredApprovedRevisionIds()).toEqual([]);
  await expectPublishedPreparationCount(0);
  await page.reload();

  await expect(page.getByTestId("week-day")).toHaveCount(7);
  await expect(page.getByTestId("week-slot")).toHaveCount(7);
  await expect(
    page.getByRole("button", { name: "Generate a reviewed week" })
  ).toHaveCount(0);
  const unavailable = page.getByRole("region", {
    name: "Weekly planning is not available yet"
  });
  await expect(unavailable).toContainText(
    "No eligible reviewed food preparations are available right now."
  );
  await expect(
    unavailable.getByRole("link", { name: "Browse Foods" })
  ).toHaveAttribute("href", "/foods");
  await expect(
    unavailable.getByRole("link", { name: "Review Feeding eligibility" })
  ).toHaveAttribute("href", "/feeding-setup");
});

test("a caregiver generates, understands, locks, regenerates, and sees later unavailability", async ({
  page,
  request
}) => {
  test.setTimeout(180_000);
  await retirePublishedPreparations(
    "SYNTHETIC PLANNER ELIGIBLE TEST ISOLATION"
  );
  await importPlannerFixture();
  const email = await createProfile(page, request);
  await configurePlannerEligibility(page);

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
  await expect(
    page.getByRole("button", { name: "Regenerate unlocked choices" })
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", {
      name: "Weekly planning is not available yet"
    })
  ).toContainText(
    "No eligible reviewed food preparations are available right now."
  );
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
      }
    ]);
});
