import { execFileSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { readLocalSupabaseStatus } from "../integration/support/local-supabase";
import { waitForMagicLink } from "./support/passwordless-auth";

type ProfileBoundarySnapshot = {
  householdId: string;
  babyId: string;
  activeBabyCount: number;
  eligibilityCount: number;
  restrictionCount: number;
  reactionCount: number;
  planCount: number;
  batchCount: number;
  historyIds: string[];
  reviewedContentCount: number;
};

function readProfileBoundarySnapshot(userId: string): ProfileBoundarySnapshot {
  expect(userId).toMatch(/^[0-9a-f-]{36}$/);
  const output = execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_mealboard-baby",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-Atc",
      `with target as (
        select
          user_profiles.household_id,
          babies.id as baby_id
        from public.user_profiles
        join public.babies
          on babies.household_id = user_profiles.household_id
          and babies.is_active
        where user_profiles.user_id = '${userId}'
      )
      select json_build_object(
        'householdId', (select household_id::text from target),
        'babyId', (select baby_id::text from target),
        'activeBabyCount', (
          select count(*)::integer
          from public.babies
          where household_id = (select household_id from target)
            and is_active
        ),
        'eligibilityCount', (
          select count(*)::integer
          from public.baby_skills
          where baby_id = (select baby_id from target)
        ),
        'restrictionCount', (
          select count(*)::integer
          from public.baby_food_restrictions
          where baby_id = (select baby_id from target)
        ),
        'reactionCount', (
          select count(*)::integer
          from public.baby_food_reaction_events
          where baby_id = (select baby_id from target)
        ),
        'planCount', (
          select count(*)::integer
          from public.meal_plans
          where baby_id = (select baby_id from target)
        ),
        'batchCount', (
          select count(*)::integer
          from public.batches
          where baby_id = (select baby_id from target)
        ),
        'historyIds', coalesce((
          select json_agg(id::text order by occurred_at, id)
          from public.product_events
          where household_id = (select household_id from target)
        ), '[]'::json),
        'reviewedContentCount', (
          select count(*)::integer
          from public.content_revisions
        )
      )`
    ],
    { encoding: "utf8" }
  ).trim();

  return JSON.parse(output) as ProfileBoundarySnapshot;
}

test("a caregiver edits the active baby profile without changing its boundaries", async ({
  page,
  request
}) => {
  test.setTimeout(180_000);
  const status = readLocalSupabaseStatus();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const email = `ticket-20-browser-${crypto.randomUUID()}@example.test`;

  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email.", {
    timeout: 20_000
  });
  await page.goto(await waitForMagicLink(request, email));

  await page.getByLabel("Nickname (optional)").fill("Before edit");
  await page.getByLabel("Birth date").fill("2025-10-15");
  await page.getByLabel("Time zone").fill("America/Chicago");
  await page.getByLabel("Mixed feeding").check();
  await page.getByLabel("Breakfast").check();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/today$/, { timeout: 20_000 });

  const users = await admin.auth.admin.listUsers();
  const user = users.data.users.find((candidate) => candidate.email === email);
  expect(user).toBeTruthy();
  const before = readProfileBoundarySnapshot(user!.id);
  expect(before.activeBabyCount).toBe(1);

  await page.getByRole("link", { name: "Account" }).click();
  await page.getByRole("link", { name: "Edit baby profile" }).click();
  await expect(page).toHaveURL(/\/profile-setup\?mode=edit$/);
  await expect(
    page.getByRole("heading", { name: "Edit baby profile", level: 1 })
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByText(
      /preparation options use feeding skills, not birthday alone/i
    )
  ).toBeVisible({ timeout: 20_000 });

  await expect(page.getByLabel("Nickname (optional)")).toHaveValue(
    "Before edit"
  );
  await expect(page.getByLabel("Birth date")).toHaveValue("2025-10-15");
  await expect(page.getByLabel("Time zone")).toHaveValue("America/Chicago");
  await expect(page.getByLabel("Mixed feeding")).toBeChecked();
  await expect(page.getByLabel("Breakfast")).toBeChecked();
  await expect(page.getByLabel("Lunch")).not.toBeChecked();
  await expect(page.getByLabel("Dinner")).not.toBeChecked();

  await page.getByLabel("Nickname (optional)").fill("After edit");
  await page.getByLabel("Birth date").fill("2025-09-20");
  await page.getByLabel("Time zone").fill("America/New_York");
  await page.getByLabel("Spoon-fed foods").check();
  await page.getByLabel("Breakfast").uncheck();
  await page.getByLabel("Lunch").check();
  await page.getByLabel("Dinner").check();
  await page.getByRole("button", { name: "Save profile" }).click();

  await expect(page).toHaveURL(/\/account\?profileUpdated=1$/, {
    timeout: 20_000
  });
  await expect(page.getByRole("status")).toContainText("Baby profile updated.");

  await page.goto("/today");
  await expect(page.getByText("After edit’s profile is ready.")).toBeVisible();

  await page.goto("/week");
  await expect(page.getByText("Dates use America/New_York.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lunch" })).toHaveCount(7);
  await expect(page.getByRole("heading", { name: "Dinner" })).toHaveCount(7);
  await expect(page.getByRole("heading", { name: "Breakfast" })).toHaveCount(0);

  await page.goto("/profile-setup?mode=edit");
  await page.getByLabel("Nickname (optional)").fill("Invalid edit");
  await page.getByLabel("Time zone").fill("Not/A_Time_Zone");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Check the profile details and try again."
    })
  ).toBeVisible({ timeout: 20_000 });

  await page.goto("/profile-setup?mode=edit");
  await expect(page.getByLabel("Nickname (optional)")).toHaveValue(
    "After edit"
  );
  await expect(page.getByLabel("Birth date")).toHaveValue("2025-09-20");
  await expect(page.getByLabel("Time zone")).toHaveValue("America/New_York");
  await expect(page.getByLabel("Spoon-fed foods")).toBeChecked();
  await expect(page.getByLabel("Lunch")).toBeChecked();
  await expect(page.getByLabel("Dinner")).toBeChecked();

  const after = readProfileBoundarySnapshot(user!.id);
  const { historyIds: historyIdsBefore, ...boundaryBefore } = before;
  const { historyIds: historyIdsAfter, ...boundaryAfter } = after;
  expect(boundaryAfter).toEqual(boundaryBefore);
  expect(historyIdsAfter).toEqual(expect.arrayContaining(historyIdsBefore));
  expect(historyIdsAfter.length).toBeGreaterThanOrEqual(
    historyIdsBefore.length
  );
});
