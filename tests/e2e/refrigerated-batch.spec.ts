import { execSync } from "node:child_process";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  expect,
  test,
  type APIRequestContext,
  type Page
} from "@playwright/test";

import { waitForMagicLink } from "./support/passwordless-auth";

const fixtureRunId = crypto.randomUUID();
const reactionGuidanceVersion =
  Number.parseInt(fixtureRunId.replaceAll("-", "").slice(0, 7), 16) + 1_000;
const fixtureIds = {
  source: `source-e2e-ticket-06-${fixtureRunId}`,
  skill: `skill-e2e-ticket-06-${fixtureRunId}`,
  allergen: `allergen-e2e-ticket-06-${fixtureRunId}`,
  food: `food-e2e-ticket-06-${fixtureRunId}`,
  foodSlug: `zzz-batch-browser-food-${fixtureRunId}`,
  preparation: `prep-e2e-ticket-06-${fixtureRunId}`,
  preparationSlug: `zzz-batch-browser-preparation-${fixtureRunId}`,
  revision: `revision-e2e-ticket-06-${fixtureRunId}`,
  rule: `rule-e2e-ticket-06-${fixtureRunId}`,
  profile: `rule-profile-e2e-ticket-06-${fixtureRunId}`,
  reactionGuidance: `reaction-guidance-e2e-ticket-11-${fixtureRunId}`,
  freezeRule: `transition-freeze-e2e-ticket-10-${fixtureRunId}`,
  thawRule: `transition-thaw-e2e-ticket-10-${fixtureRunId}`,
  returnRefrigeratedRule: `transition-return-refrigerated-e2e-ticket-10-${fixtureRunId}`,
  returnThawedRule: `transition-return-thawed-e2e-ticket-10-${fixtureRunId}`
};

const fixture = {
  sources: [
    {
      id: fixtureIds.source,
      publisher: "Synthetic batch browser publisher",
      title: "Synthetic batch browser source",
      url: "https://example.test/batch-browser",
      source_date: "2026-01-01",
      accessed_at: "2026-07-28"
    }
  ],
  tags: [
    {
      id: fixtureIds.skill,
      kind: "skill",
      label: "Synthetic browser batch ability"
    },
    {
      id: fixtureIds.allergen,
      kind: "allergen",
      label: "Synthetic browser batch allergen"
    }
  ],
  foods: [
    {
      id: fixtureIds.food,
      slug: fixtureIds.foodSlug,
      name: "ZZZ Batch Browser Food",
      category: "synthetic-test-fixture"
    }
  ],
  preparations: [
    {
      id: fixtureIds.preparation,
      food_id: fixtureIds.food,
      slug: fixtureIds.preparationSlug,
      name: "ZZZ Batch Browser Preparation",
      is_active: true
    }
  ],
  revisions: [
    {
      id: fixtureIds.revision,
      preparation_id: fixtureIds.preparation,
      version: 1,
      status: "approved",
      method: "SYNTHETIC BATCH BROWSER METHOD",
      shape_texture: "SYNTHETIC BATCH BROWSER TEXTURE",
      source_id: fixtureIds.source,
      reviewer_role: "synthetic_browser_reviewer",
      reviewed_at: "2026-07-28",
      approved_at: "2026-07-28",
      next_review_at: "2027-07-28",
      tag_ids: [fixtureIds.skill, fixtureIds.allergen],
      storage_rules: [
        {
          id: fixtureIds.rule,
          support_status: "supported",
          deadline_kind: "discard_after",
          duration_hours: 24,
          guidance: "SYNTHETIC REVIEWED BROWSER STORAGE GUIDANCE"
        }
      ]
    }
  ],
  retirements: []
} as const;

let admin: SupabaseClient;

async function createProfile(
  page: Page,
  request: APIRequestContext
): Promise<void> {
  const email = `ticket-06-browser-${crypto.randomUUID()}@example.test`;
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.goto(await waitForMagicLink(request, email));
  await page.getByLabel("Nickname (optional)").fill("Juniper");
  await page.getByLabel("Birth date").fill("2025-10-15");
  await page.getByLabel("Time zone").fill("America/Chicago");
  await page.getByLabel("Mixed feeding").check();
  await page.getByLabel("Breakfast").check();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/today$/, { timeout: 20_000 });
}

test.beforeAll(async () => {
  const status = JSON.parse(
    execSync("pnpm exec supabase status -o json", { encoding: "utf8" })
  ) as { API_URL: string; SERVICE_ROLE_KEY: string };
  admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  expect(
    (
      await admin.rpc("import_catalog_fixture", {
        p_fixture: fixture
      })
    ).error
  ).toBeNull();
  expect(
    (
      await admin.rpc("import_storage_transition_rules", {
        p_rules: [
          {
            id: fixtureIds.freezeRule,
            content_revision_id: fixtureIds.revision,
            transition_kind: "freeze",
            from_state: "refrigerated",
            to_state: "frozen",
            deadline_kind: "quality_by",
            duration_min_hours: 720,
            duration_max_hours: 720,
            clock_start_event: null,
            resets_prior_clock: false,
            method: null,
            refreezing_policy: null,
            return_policy: null,
            guidance: "SYNTHETIC REVIEWED BROWSER FREEZER QUALITY GUIDANCE",
            source_id: fixtureIds.source,
            reviewer_role: "synthetic_browser_reviewer",
            reviewed_at: "2026-07-28",
            approved_at: "2026-07-28",
            next_review_at: "2027-07-28"
          },
          {
            id: fixtureIds.thawRule,
            content_revision_id: fixtureIds.revision,
            transition_kind: "begin_thaw",
            from_state: "frozen",
            to_state: "thawing",
            deadline_kind: "discard_after",
            duration_min_hours: 12,
            duration_max_hours: 18,
            clock_start_event: "thaw_started",
            resets_prior_clock: false,
            method: "SYNTHETIC REVIEWED BROWSER THAW METHOD",
            refreezing_policy: "prohibited",
            return_policy: null,
            guidance: "SYNTHETIC REVIEWED BROWSER POST-THAW GUIDANCE",
            source_id: fixtureIds.source,
            reviewer_role: "synthetic_browser_reviewer",
            reviewed_at: "2026-07-28",
            approved_at: "2026-07-28",
            next_review_at: "2027-07-28"
          },
          ...(["refrigerated", "thawed"] as const).map((fromState) => ({
            id:
              fromState === "refrigerated"
                ? fixtureIds.returnRefrigeratedRule
                : fixtureIds.returnThawedRule,
            content_revision_id: fixtureIds.revision,
            transition_kind: "return_untouched",
            from_state: fromState,
            to_state: fromState,
            deadline_kind: null,
            duration_min_hours: null,
            duration_max_hours: null,
            clock_start_event: null,
            resets_prior_clock: false,
            method: null,
            refreezing_policy: null,
            return_policy: "untouched_separately_stored_only",
            guidance: "SYNTHETIC REVIEWED BROWSER UNTOUCHED RETURN GUIDANCE",
            source_id: fixtureIds.source,
            reviewer_role: "synthetic_browser_reviewer",
            reviewed_at: "2026-07-28",
            approved_at: "2026-07-28",
            next_review_at: "2027-07-28"
          }))
        ]
      })
    ).error
  ).toBeNull();
  expect(
    (
      await admin.rpc("import_storage_rule_profiles", {
        p_profiles: [
          {
            id: fixtureIds.profile,
            storage_rule_id: fixtureIds.rule,
            content_revision_id: fixtureIds.revision,
            storage_location: "refrigerator",
            start_event_kind: "prepared_or_opened",
            precedence: 0,
            duration_min_hours: 24,
            duration_max_hours: 48,
            source_id: fixtureIds.source,
            reviewer_role: "synthetic_browser_reviewer",
            reviewed_at: "2026-07-28",
            approved_at: "2026-07-28",
            next_review_at: "2027-07-28"
          }
        ]
      })
    ).error
  ).toBeNull();
  expect(
    (
      await admin.rpc("import_reaction_guidance_fixture", {
        p_records: [
          {
            id: fixtureIds.reactionGuidance,
            guidance_key: "post-serve-reaction-care-direction",
            version: reactionGuidanceVersion,
            status: "approved",
            guidance: "SYNTHETIC REVIEWED BROWSER REACTION CARE DIRECTION",
            source_id: fixtureIds.source,
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

test.afterAll(async () => {
  expect(
    (
      await admin.from("content_retirements").insert({
        revision_id: fixtureIds.revision,
        retired_at: "2026-07-28",
        reason: "SYNTHETIC BROWSER FIXTURE CLEANUP"
      })
    ).error
  ).toBeNull();
  expect(
    (
      await admin.from("reaction_guidance_retirements").insert({
        guidance_revision_id: fixtureIds.reactionGuidance,
        retired_at: "2026-07-28",
        reason: "SYNTHETIC BROWSER FIXTURE CLEANUP"
      })
    ).error
  ).toBeNull();
});

test("a caregiver reviews a conservative deadline and refrigerates two planned portions", async ({
  page,
  request
}) => {
  test.setTimeout(240_000);
  const preparedAt = new Date(Date.now() - 60_000);
  const deadlineAt = new Date(preparedAt.getTime() + 24 * 60 * 60 * 1000);
  const chicagoFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Chicago"
  });
  const expectedPreparedTime = chicagoFormatter.format(preparedAt);
  const expectedDeadlineTime = chicagoFormatter.format(deadlineAt);
  await createProfile(page, request);

  await page.goto("/feeding-setup");
  await page
    .getByLabel("Synthetic browser batch ability")
    .selectOption("observed");
  await page
    .getByLabel("Safety status for ZZZ Batch Browser Food")
    .selectOption("no_known_restriction");
  await page.getByLabel("New-food pace").selectOption("one_per_week");
  await page
    .getByLabel("Preparation-time preference")
    .selectOption("under_30_minutes");
  await page.getByRole("button", { name: "Save feeding setup" }).click();
  await expect(page.getByRole("status")).toContainText("Feeding setup saved");

  await page.goto(`/foods/${fixtureIds.preparationSlug}`);
  await page.getByRole("button", { name: "Add to tomorrow's meal" }).click();
  await expect(page).toHaveURL(/\/week\?planned=1$/, { timeout: 20_000 });

  const tomorrow = page.getByTestId("week-day").filter({ hasText: "Tomorrow" });
  const prepareHref = await tomorrow
    .getByRole("link", { name: "Prepare and refrigerate" })
    .getAttribute("href");
  expect(prepareHref).not.toBeNull();
  const editMeal = tomorrow
    .locator("details")
    .filter({ has: page.getByText("Edit meal", { exact: true }) });
  await editMeal.locator("summary").click();
  await editMeal.getByRole("button", { name: "Copy to next day" }).click();
  await expect(page).toHaveURL(/edited=copy_meal/);
  await expect(
    page.getByTestId("week-day").filter({ hasText: "Day 3" })
  ).toContainText("ZZZ Batch Browser Preparation");
  await page.goto("/kitchen");
  const preparationWork = page.getByTestId("preparation-work");
  await expect(preparationWork).toContainText("ZZZ Batch Browser Preparation");
  await expect(preparationWork).toContainText("2 portions needed");
  await expect(preparationWork.locator("li")).toHaveCount(2);
  const taskStartHref = await preparationWork
    .getByRole("link", { name: "Start this batch" })
    .getAttribute("href");
  expect(taskStartHref).toMatch(/^\/kitchen\?componentId=/);

  const derivedGroceries = page.getByTestId("derived-groceries");
  await expect(derivedGroceries).toContainText("Plan-derived");
  await expect(derivedGroceries).toContainText("ZZZ Batch Browser Food");
  await expect(derivedGroceries).toContainText("2 portions");
  await derivedGroceries
    .getByRole("button", { name: "I already have this" })
    .click();
  await expect(page).toHaveURL(/grocery=updated/);
  await expect(
    page.getByText(/Already have · synthetic-test-fixture/)
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Move back to grocery needs" })
    .click();
  await expect(page.getByTestId("derived-groceries")).toContainText(
    "ZZZ Batch Browser Food"
  );

  await page.getByLabel("Item", { exact: true }).fill("Manual browser item");
  await page.getByLabel("Store section", { exact: true }).fill("Manual aisle");
  await page.getByLabel("Quantity (items)", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Add manual item" }).click();
  await expect(page).toHaveURL(/grocery=add/);
  const manualGroceries = page.getByTestId("manual-groceries");
  await expect(manualGroceries).toContainText("Manual item · Manual aisle");
  await expect(manualGroceries).toContainText("2 items");
  await manualGroceries.getByLabel("Item", { exact: true }).fill("Edited item");
  await manualGroceries
    .getByRole("button", { name: "Save manual item" })
    .click();
  await expect(page.getByTestId("manual-groceries")).toContainText(
    "Edited item"
  );
  await page
    .getByTestId("manual-groceries")
    .getByRole("button", { name: "Check off" })
    .click();
  await expect(
    page
      .getByTestId("manual-groceries")
      .getByRole("button", { name: "Mark not checked" })
  ).toBeVisible();
  await page
    .getByTestId("manual-groceries")
    .getByRole("button", { name: "Delete manual item" })
    .click();
  await expect(page.getByTestId("manual-groceries")).toBeEmpty();

  await page
    .getByTestId("preparation-work")
    .getByRole("button", { name: "Hide this reminder" })
    .click();
  await expect(page).toHaveURL(/work=dismissed/);
  await expect(page.getByTestId("preparation-work")).toHaveCount(0);
  await page.goto("/week");
  await expect(
    page.getByTestId("week-day").filter({ hasText: "Day 3" })
  ).toContainText("ZZZ Batch Browser Preparation");

  await page.goto(taskStartHref ?? prepareHref!);

  await expect(page).toHaveURL(/\/kitchen\?componentId=/, { timeout: 20_000 });
  await page.goto(
    `${page.url()}&preparedAt=${encodeURIComponent(preparedAt.toISOString())}`
  );
  await expect(
    page.getByRole("heading", { name: "Review this batch", level: 2 })
  ).toBeVisible();
  await expect(page.getByText("Reviewed range: 24–48 hours")).toBeVisible();
  await expect(
    page.getByText("SYNTHETIC REVIEWED BROWSER STORAGE GUIDANCE")
  ).toBeVisible();
  await expect(page.getByText("Conservative duration: 24 hours")).toBeVisible();
  await expect(page.getByTestId("batch-preview-prepared-time")).toHaveText(
    expectedPreparedTime
  );
  await expect(page.getByTestId("batch-preview-deadline-time")).toHaveText(
    expectedDeadlineTime
  );

  await page.getByRole("button", { name: "Refrigerate 2 portions" }).click();
  await expect(page).toHaveURL(/\/kitchen\?created=1$/, { timeout: 20_000 });
  await expect(page.getByRole("status")).toContainText(
    "Two portions are in the refrigerator"
  );

  const batch = page.getByTestId("kitchen-batch");
  await expect(batch).toContainText("ZZZ Batch Browser Preparation");
  await expect(batch).toContainText("2 portions remaining");
  await expect(batch).toContainText(/Ready|Use Today/);
  await expect(batch).toContainText("Discard deadline");
  await expect(page.getByTestId("kitchen-batch-prepared-time")).toHaveText(
    expectedPreparedTime
  );
  await expect(page.getByTestId("kitchen-batch-deadline-time")).toHaveText(
    expectedDeadlineTime
  );
  await expect(page.getByText("Dates use America/Chicago")).toBeVisible();

  await batch.getByRole("button", { name: "Freeze untouched batch" }).click();
  await expect(page).toHaveURL(/\/kitchen\?transitioned=freeze$/);
  await expect(page.getByRole("heading", { name: "Freezer" })).toBeVisible();
  const frozenBatch = page.getByTestId("kitchen-batch");
  await expect(frozenBatch).toContainText("Quality-by date");
  await expect(frozenBatch).toContainText(
    "SYNTHETIC REVIEWED BROWSER FREEZER QUALITY GUIDANCE"
  );
  await expect(frozenBatch.getByTestId("reviewed-next-action")).toContainText(
    "SYNTHETIC REVIEWED BROWSER THAW METHOD"
  );
  await expect(frozenBatch.getByTestId("reviewed-next-action")).toContainText(
    "Refreezing: prohibited"
  );

  await page.goto("/today");
  await expect(
    page.getByRole("heading", { name: "Next planned meal" })
  ).toBeVisible();
  const todayComponent = page.getByTestId("today-component");
  await expect(todayComponent).toContainText("ZZZ Batch Browser Preparation");
  await expect(todayComponent).toContainText("Thaw required");
  await expect(
    todayComponent.getByRole("button", { name: "Serve one portion" })
  ).toHaveCount(0);

  await page.goto("/kitchen");
  await page
    .getByTestId("kitchen-batch")
    .getByRole("button", { name: "Begin reviewed thaw" })
    .click();
  await expect(page).toHaveURL(/\/kitchen\?transitioned=begin_thaw$/);
  const thawingBatch = page.getByTestId("kitchen-batch");
  await expect(thawingBatch).toContainText(
    "SYNTHETIC REVIEWED BROWSER THAW METHOD"
  );
  await expect(thawingBatch).toContainText("prohibited");
  await thawingBatch.getByRole("button", { name: "Mark fully thawed" }).click();
  await expect(page).toHaveURL(/\/kitchen\?transitioned=mark_thawed$/);

  await page.goto("/today");
  await expect(todayComponent).toContainText("Ready");
  await todayComponent
    .getByRole("button", { name: "Serve one portion" })
    .click();
  await expect(page).toHaveURL(/\/today\?served=1&servedEvent=[0-9a-f-]+$/, {
    timeout: 20_000
  });
  await expect(page.getByRole("status")).toContainText(
    "One portion was served as planned"
  );
  await expect(
    page.getByRole("heading", {
      name: "Report a reaction to ZZZ Batch Browser Food"
    })
  ).toBeVisible();
  await expect(page.getByText("Reviewed care direction")).toBeVisible();
  await expect(
    page.getByText("SYNTHETIC REVIEWED BROWSER REACTION CARE DIRECTION")
  ).toBeVisible();
  await expect(page.getByText(/does not interpret symptoms/i)).toBeVisible();
  await page.getByLabel("Optional food preference").selectOption("disliked");
  await page
    .getByLabel("Private reaction description (optional)")
    .fill("SYNTHETIC PRIVATE BROWSER REACTION DESCRIPTION");
  await page
    .getByRole("button", { name: "Report reaction and block food" })
    .click();
  await expect(page).toHaveURL(/\/today\?reaction=reported$/, {
    timeout: 20_000
  });
  await expect(page.getByRole("status")).toContainText(
    "blocked from Today, Week edits, and future planning"
  );
  await expect(page.getByTestId("today-component")).toContainText(
    "Unavailable"
  );

  await page.goto("/week");
  const replacement = page.getByTestId("week-day").filter({ hasText: "Day 3" });
  await expect(replacement).toContainText(
    "This food is blocked by the current feeding setup. Replace or remove it."
  );

  await page.goto("/feeding-setup");
  await expect(
    page.getByRole("heading", {
      name: "ZZZ Batch Browser Food is blocked"
    })
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Resolve reaction safety block for ZZZ Batch Browser Food"
    })
    .click();
  await expect(page).toHaveURL(/\/feeding-setup\?reaction=resolved$/, {
    timeout: 20_000
  });
  await expect(page.getByRole("status")).toContainText(
    "audited reaction history was preserved"
  );

  await page.goto("/kitchen");
  const servedBatch = page.getByTestId("kitchen-batch");
  await expect(servedBatch).toContainText("1 portion remaining");
  await expect(servedBatch.getByTestId("reviewed-next-action")).toContainText(
    "SYNTHETIC REVIEWED BROWSER UNTOUCHED RETURN GUIDANCE"
  );
  await servedBatch
    .getByLabel(
      "I confirm this portion stayed untouched and separately stored."
    )
    .check();
  await servedBatch
    .getByRole("button", { name: "Return untouched portion" })
    .click();
  await expect(page).toHaveURL(/\/kitchen\?transitioned=return_untouched$/);
  await expect(page.getByTestId("kitchen-batch")).toContainText(
    "2 portions remaining"
  );

  await page
    .getByTestId("kitchen-batch")
    .getByRole("button", { name: "Correct inventory down by one" })
    .click();
  await expect(page).toHaveURL(/\/kitchen\?transitioned=correct$/);
  await expect(page.getByTestId("kitchen-batch")).toContainText(
    "1 portion remaining"
  );

  await page
    .getByTestId("kitchen-batch")
    .getByRole("button", { name: "Mark remaining portions finished" })
    .click();
  await expect(page).toHaveURL(/\/kitchen\?transitioned=finish$/);
  await expect(page.getByTestId("kitchen-finished-batch")).toContainText(
    "0 portions remaining"
  );

  await page.goto("/week");
  const servedTomorrow = page
    .getByTestId("week-day")
    .filter({ hasText: "Tomorrow" });
  await expect(servedTomorrow).toContainText("Served");

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    )
  ).toBe(false);
});

test("a use-soon batch expires on an open screen, is blocked, and can be discarded", async ({
  page,
  request
}) => {
  test.setTimeout(150_000);
  const chicagoFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Chicago"
  });
  await createProfile(page, request);

  await page.goto("/feeding-setup");
  await page
    .getByLabel("Synthetic browser batch ability")
    .selectOption("observed");
  await page
    .getByLabel("Safety status for ZZZ Batch Browser Food")
    .selectOption("no_known_restriction");
  await page.getByLabel("New-food pace").selectOption("one_per_week");
  await page
    .getByLabel("Preparation-time preference")
    .selectOption("under_30_minutes");
  await page.getByRole("button", { name: "Save feeding setup" }).click();
  await expect(page.getByRole("status")).toContainText("Feeding setup saved");

  await page.goto(`/foods/${fixtureIds.preparationSlug}`);
  await page.getByRole("button", { name: "Add to tomorrow's meal" }).click();
  await expect(page).toHaveURL(/\/week\?planned=1$/, { timeout: 20_000 });

  const tomorrow = page.getByTestId("week-day").filter({ hasText: "Tomorrow" });
  const prepareHref = await tomorrow
    .getByRole("link", { name: "Prepare and refrigerate" })
    .getAttribute("href");
  expect(prepareHref).not.toBeNull();

  const regularPreparedAt = new Date();
  await page.goto(
    `${prepareHref!}&preparedAt=${encodeURIComponent(regularPreparedAt.toISOString())}`
  );
  await page.getByRole("button", { name: "Refrigerate 2 portions" }).click();
  await expect(page).toHaveURL(/\/kitchen\?created=1$/, { timeout: 20_000 });

  const expiringPreparedAt = new Date(
    Date.now() - 24 * 60 * 60 * 1000 + 20_000
  );
  const expiringDeadlineAt = new Date(
    expiringPreparedAt.getTime() + 24 * 60 * 60 * 1000
  );
  const expectedExpiringDeadline = chicagoFormatter.format(expiringDeadlineAt);
  const expectedRegularDeadline = chicagoFormatter.format(
    new Date(regularPreparedAt.getTime() + 24 * 60 * 60 * 1000)
  );

  await page.goto(
    `${prepareHref!}&preparedAt=${encodeURIComponent(expiringPreparedAt.toISOString())}`
  );
  await page.getByRole("button", { name: "Refrigerate 2 portions" }).click();
  await expect(page).toHaveURL(/\/kitchen\?created=1$/, { timeout: 20_000 });

  const activeBatches = page.getByTestId("kitchen-batch");
  await expect(activeBatches).toHaveCount(2);
  await expect(
    activeBatches.first().getByTestId("kitchen-batch-deadline-time")
  ).toHaveText(expectedExpiringDeadline);
  await expect(
    page.getByRole("button", { name: "Freeze untouched batch" })
  ).toHaveCount(2);

  await page.goto("/today");
  const useSoonBatches = page.getByTestId("use-soon-batch");
  await expect(useSoonBatches).toHaveCount(2);
  await expect(useSoonBatches.first()).toContainText(expectedExpiringDeadline);
  await expect(useSoonBatches.first()).toContainText(
    "SYNTHETIC REVIEWED BROWSER STORAGE GUIDANCE"
  );
  await expect(
    useSoonBatches.first().getByRole("button", { name: "Use in next meal" })
  ).toBeVisible();

  const todayComponent = page.getByTestId("today-component");
  await expect(todayComponent).toContainText(expectedExpiringDeadline);

  const millisecondsUntilExpired =
    expiringDeadlineAt.getTime() - Date.now() + 1_000;
  if (millisecondsUntilExpired > 0) {
    await page.waitForTimeout(millisecondsUntilExpired);
  }

  await todayComponent
    .getByRole("button", { name: "Serve one portion" })
    .click();
  await expect(todayComponent.getByRole("alert")).toContainText(
    "The reviewed deadline has passed. This portion was not served."
  );

  await page.goto("/today");
  await expect(page.getByTestId("today-component")).toContainText(
    expectedRegularDeadline
  );
  await expect(page.getByTestId("use-soon-batch")).toHaveCount(1);

  await page.goto("/kitchen");
  await expect(
    page
      .getByTestId("kitchen-batch")
      .first()
      .getByTestId("kitchen-batch-deadline-time")
  ).toHaveText(expectedRegularDeadline);
  const expiredBatch = page.getByTestId("kitchen-expired-batch");
  await expect(expiredBatch).toContainText(expectedExpiringDeadline);
  await expect(expiredBatch).toContainText(
    "SYNTHETIC REVIEWED BROWSER STORAGE GUIDANCE"
  );
  await expiredBatch
    .getByRole("button", { name: "Discard remaining portions" })
    .click();
  await expect(page).toHaveURL(/\/kitchen\?discarded=1$/);
  await expect(page.getByRole("status")).toContainText(
    "Remaining portions were discarded."
  );
  await expect(page.getByTestId("kitchen-expired-batch")).toHaveCount(0);
});
