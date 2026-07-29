import { execSync } from "node:child_process";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
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
    },
    {
      id: "food-e2e-ticket-09-2",
      slug: "bbb-week-editor-food",
      name: "BBB Week Editor Food",
      category: "synthetic-test-fixture"
    },
    {
      id: "food-e2e-ticket-09-3",
      slug: "ccc-week-editor-food",
      name: "CCC Week Editor Food",
      category: "synthetic-test-fixture"
    },
    {
      id: "food-e2e-ticket-09-4",
      slug: "ddd-week-editor-backup-food",
      name: "DDD Week Editor Backup Food",
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
    },
    {
      id: "prep-e2e-ticket-09-2",
      food_id: "food-e2e-ticket-09-2",
      slug: "bbb-week-editor-preparation",
      name: "BBB Week Editor Preparation",
      is_active: true
    },
    {
      id: "prep-e2e-ticket-09-3",
      food_id: "food-e2e-ticket-09-3",
      slug: "ccc-week-editor-preparation",
      name: "CCC Week Editor Preparation",
      is_active: true
    },
    {
      id: "prep-e2e-ticket-09-4",
      food_id: "food-e2e-ticket-09-4",
      slug: "ddd-week-editor-backup-preparation",
      name: "DDD Week Editor Backup Preparation",
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
    },
    ...[
      { number: 2, preparationId: "prep-e2e-ticket-09-2" },
      { number: 3, preparationId: "prep-e2e-ticket-09-3" },
      { number: 4, preparationId: "prep-e2e-ticket-09-4" }
    ].map(({ number, preparationId }) => ({
      id: `revision-e2e-ticket-09-${number}`,
      preparation_id: preparationId,
      version: 1,
      status: "approved" as const,
      method: `SYNTHETIC WEEK EDITOR METHOD ${number}`,
      shape_texture: `SYNTHETIC WEEK EDITOR TEXTURE ${number}`,
      source_id: "source-e2e-ticket-05",
      reviewer_role: "synthetic_browser_reviewer",
      reviewed_at: "2026-07-27",
      approved_at: "2026-07-27",
      next_review_at: "2027-07-27",
      tag_ids: ["skill-e2e-ticket-05", "allergen-e2e-ticket-05"],
      storage_rules: [
        {
          id: `rule-e2e-ticket-09-${number}`,
          support_status: "unsupported" as const,
          deadline_kind: null,
          duration_hours: null,
          guidance: null
        }
      ]
    }))
  ],
  retirements: []
} as const;

async function createProfile(
  page: Page,
  request: APIRequestContext
): Promise<string> {
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
  return email;
}

let admin: SupabaseClient;

test.beforeAll(async () => {
  const status = JSON.parse(
    execSync("pnpm exec supabase status -o json", { encoding: "utf8" })
  ) as { API_URL: string; SERVICE_ROLE_KEY: string };
  admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
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

test("a caregiver edits a complete manual week on a narrow viewport", async ({
  page,
  request
}) => {
  test.setTimeout(240_000);
  const email = await createProfile(page, request);

  await page.goto("/feeding-setup");
  await page
    .getByLabel("Synthetic browser planning ability")
    .selectOption("observed");
  for (const foodName of [
    "AAA Planning Browser Food",
    "BBB Week Editor Food",
    "CCC Week Editor Food",
    "DDD Week Editor Backup Food"
  ]) {
    await page
      .getByLabel(`Safety status for ${foodName}`)
      .selectOption("no_known_restriction");
  }
  await page.getByLabel("Quick backup: DDD Week Editor Backup Food").check();
  await page.getByLabel("New-food pace").selectOption("one_per_week");
  await page
    .getByLabel("Preparation-time preference")
    .selectOption("under_30_minutes");
  await page.getByRole("button", { name: "Save feeding setup" }).click();
  await expect(page.getByRole("status")).toContainText("Feeding setup saved");

  await page.goto("/week");
  await expect(page.getByTestId("week-day")).toHaveCount(7);

  const day = (index: number) => page.getByTestId("week-day").nth(index);
  const breakfast = (index: number) =>
    day(index).getByTestId("week-slot").filter({ hasText: "Breakfast" });
  const openPanel = async (scope: Locator, label: string) => {
    await scope
      .locator("summary")
      .filter({ hasText: label })
      .evaluate((summary) => {
        (summary.parentElement as HTMLDetailsElement).open = true;
      });
  };

  let targetSlot = breakfast(1);
  await openPanel(targetSlot, "Add component");
  await targetSlot
    .getByLabel("Reviewed preparation for Add component")
    .selectOption("aaa-planning-browser-preparation");
  await targetSlot
    .getByRole("button", { name: "Add component", exact: true })
    .click();
  await expect(page).toHaveURL(/edited=add_component/);
  await expect(breakfast(1)).toContainText("AAA Planning Browser Preparation");

  let component = breakfast(1).getByTestId("week-component");
  await openPanel(component, "Edit component");
  await component.getByRole("button", { name: "Lock component" }).click();
  await expect(page).toHaveURL(/edited=set_component_lock/);
  await expect(breakfast(1)).toContainText("Component locked");

  component = breakfast(1).getByTestId("week-component");
  await openPanel(component, "Edit component");
  await component.getByRole("button", { name: "Unlock component" }).click();
  await expect(breakfast(1)).not.toContainText("Component locked");

  component = breakfast(1).getByTestId("week-component");
  await openPanel(component, "Edit component");
  await component
    .getByLabel("Reviewed preparation for Swap component")
    .selectOption("bbb-week-editor-preparation");
  await component
    .getByRole("button", { name: "Swap component", exact: true })
    .click();
  await expect(page).toHaveURL(/edited=swap_component/);
  await expect(breakfast(1)).toContainText("BBB Week Editor Preparation");

  await page
    .getByRole("button", { name: "Undo most recent swap", exact: true })
    .click();
  await expect(page).toHaveURL(/edited=undo_last_swap/);
  await expect(breakfast(1)).toContainText("AAA Planning Browser Preparation");

  targetSlot = breakfast(1);
  await openPanel(targetSlot, "Edit meal");
  await targetSlot.getByRole("button", { name: "Copy to next day" }).click();
  await expect(page).toHaveURL(/edited=copy_meal/);
  await expect(breakfast(2)).toContainText("AAA Planning Browser Preparation");

  targetSlot = breakfast(2);
  await openPanel(targetSlot, "Edit meal");
  await targetSlot
    .getByLabel("Reviewed preparation for Swap whole meal")
    .selectOption("ccc-week-editor-preparation");
  await targetSlot
    .getByRole("button", { name: "Swap whole meal", exact: true })
    .click();
  await expect(page).toHaveURL(/edited=swap_meal/);
  await expect(breakfast(2)).toContainText("CCC Week Editor Preparation");

  targetSlot = breakfast(2);
  await openPanel(targetSlot, "Edit meal");
  await targetSlot
    .getByLabel("Reviewed preparation for Use quick backup")
    .selectOption("ddd-week-editor-backup-preparation");
  await targetSlot
    .getByRole("button", { name: "Use quick backup", exact: true })
    .click();
  await expect(page).toHaveURL(/edited=use_quick_backup/);
  await expect(breakfast(2)).toContainText("Quick backup");

  const user = (await admin.auth.admin.listUsers()).data.users.find(
    (candidate) => candidate.email === email
  );
  expect(user).toBeTruthy();
  await expect
    .poll(async () => {
      const result = await admin
        .from("product_events")
        .select("event_name,operation,outcome")
        .eq("actor_user_id", user!.id)
        .in("event_name", ["swap_outcome", "quick_backup_outcome"])
        .order("occurred_at");
      return result.data;
    })
    .toEqual([
      {
        event_name: "swap_outcome",
        operation: "swap_component",
        outcome: "success"
      },
      {
        event_name: "swap_outcome",
        operation: "swap_meal",
        outcome: "success"
      },
      {
        event_name: "quick_backup_outcome",
        operation: "use_quick_backup",
        outcome: "success"
      }
    ]);

  targetSlot = breakfast(2);
  await openPanel(targetSlot, "Edit meal");
  await targetSlot.getByRole("button", { name: "Mark completed" }).click();
  await expect(page).toHaveURL(/edited=set_meal_status/);
  await expect(breakfast(2)).toContainText("Completed");

  targetSlot = breakfast(2);
  await openPanel(targetSlot, "Edit meal");
  await targetSlot.getByRole("button", { name: "Lock meal" }).click();
  await expect(page).toHaveURL(/edited=set_meal_lock/);
  await page.reload();
  await expect(breakfast(2)).toContainText("Meal locked");

  targetSlot = breakfast(2);
  await openPanel(targetSlot, "Edit meal");
  await targetSlot.getByRole("button", { name: "Unlock meal" }).click();
  await expect(breakfast(2)).not.toContainText("Meal locked");

  await page.goto("/feeding-setup");
  await page
    .getByLabel("Safety status for AAA Planning Browser Food")
    .selectOption("temporary_avoidance");
  await page.getByRole("button", { name: "Save feeding setup" }).click();
  await expect(page.getByRole("status")).toContainText("Feeding setup saved");
  await page.goto("/week");

  component = breakfast(1).getByTestId("week-component");
  await expect(component).toContainText(
    "This food is blocked by the current feeding setup. Replace or remove it."
  );
  await expect(
    component.getByRole("link", { name: "Prepare and refrigerate" })
  ).toHaveCount(0);
  await openPanel(component, "Edit component");
  await expect(
    component.getByLabel("Reviewed preparation for Swap component")
  ).toBeVisible();
  await expect(
    component.getByRole("button", { name: "Delete component" })
  ).toBeVisible();
  await component.getByRole("button", { name: "Delete component" }).click();
  await expect(page).toHaveURL(/edited=delete_component/);
  await expect(breakfast(1)).toContainText("Nothing planned yet");

  targetSlot = breakfast(1);
  await openPanel(targetSlot, "Edit meal");
  await targetSlot.getByRole("button", { name: "Mark skipped" }).click();
  await expect(breakfast(1)).toContainText("Skipped");
  await expect(
    page.getByText("Plan a few reviewed foods when you are ready.")
  ).toBeVisible();

  const nextWindowHref = await page
    .getByRole("link", { name: "Next 7 days" })
    .getAttribute("href");
  expect(nextWindowHref).not.toBeNull();
  await page.goto(nextWindowHref!);
  await expect(page.getByTestId("week-day")).toHaveCount(7);
  await expect(day(0)).toContainText("Window start");

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    )
  ).toBe(false);
});
