import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  authenticatedClient,
  type LocalSupabaseStatus,
  readLocalSupabaseStatus,
  waitForAuth
} from "./support/local-supabase";

type TestUser = { id: string; client: SupabaseClient };

describe("personal recipes", () => {
  let status: LocalSupabaseStatus;
  let admin: SupabaseClient;
  let anonymous: SupabaseClient;
  let householdA: TestUser;
  let householdB: TestUser;
  let babyAId: string;
  const createdUserIds: string[] = [];

  async function createUser(label: string): Promise<TestUser> {
    const email = `personal-recipe-${label}-${crypto.randomUUID()}@example.test`;
    const password = `PersonalRecipe-${crypto.randomUUID()}`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    expect(created.error).toBeNull();
    createdUserIds.push(created.data.user!.id);
    const authClient = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const signedIn = await authClient.auth.signInWithPassword({
      email,
      password
    });
    expect(signedIn.error).toBeNull();
    return {
      id: created.data.user!.id,
      client: authenticatedClient(status, signedIn.data.session!.access_token)
    };
  }

  async function createBaby(user: TestUser): Promise<string> {
    expect((await user.client.rpc("bootstrap_account")).error).toBeNull();
    const result = await user.client.rpc("complete_baby_profile", {
      p_nickname: "Recipe baby",
      p_birth_date: "2025-10-15",
      p_time_zone: "America/Chicago",
      p_feeding_style: "mixed",
      p_meal_slots: ["breakfast", "lunch", "dinner"]
    });
    expect(result.error).toBeNull();
    return result.data as string;
  }

  beforeAll(async () => {
    status = readLocalSupabaseStatus();
    await waitForAuth(status);
    admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    anonymous = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    householdA = await createUser("a");
    householdB = await createUser("b");
    babyAId = await createBaby(householdA);
    await createBaby(householdB);
  });

  afterAll(async () => {
    if (!admin) return;
    for (const userId of createdUserIds) {
      expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
    }
  });

  test("saves a private recipe and keeps it out of anonymous reads", async () => {
    const created = await householdA.client.rpc("create_personal_recipe", {
      p_title: "Banana oats",
      p_ingredients: "Banana\nOats",
      p_instructions: "Mix together.",
      p_notes: "Family note",
      p_source_url: "https://example.com/banana-oats",
      p_source_type: "recipe_url",
      p_extraction_method: "json_ld"
    });
    expect(created.error).toBeNull();
    expect(created.data.title).toBe("Banana oats");

    const list = await householdA.client.rpc("list_personal_recipes");
    expect(list.error).toBeNull();
    expect(list.data).toHaveLength(1);
    expect((await householdB.client.rpc("list_personal_recipes")).data).toEqual(
      []
    );
    expect((await anonymous.rpc("list_personal_recipes")).error).not.toBeNull();
  });

  test("plans a personal recipe on a configured week day and is idempotent", async () => {
    const recipes = await householdA.client.rpc("list_personal_recipes");
    const recipeId = recipes.data[0].id as string;
    const week = await householdA.client.rpc("get_week_window");
    expect(week.error).toBeNull();
    const windowStart = week.data.window_start as string;

    const planned = await householdA.client.rpc("plan_personal_recipe", {
      p_baby_id: babyAId,
      p_recipe_id: recipeId,
      p_local_date: windowStart,
      p_meal_slot: "breakfast"
    });
    expect(planned.error).toBeNull();
    expect(planned.data.status).toBe("planned");

    const replay = await householdA.client.rpc("plan_personal_recipe", {
      p_baby_id: babyAId,
      p_recipe_id: recipeId,
      p_local_date: windowStart,
      p_meal_slot: "breakfast"
    });
    expect(replay.error).toBeNull();
    expect(
      (
        await householdA.client.rpc("list_personal_planning_items", {
          p_window_start: windowStart
        })
      ).data
    ).toHaveLength(1);

    const today = await householdA.client.rpc("get_today_meal");
    const kitchen = await householdA.client.rpc("get_kitchen_inventory");
    expect(JSON.stringify(today.data)).not.toContain("Banana oats");
    expect(JSON.stringify(kitchen.data)).not.toContain("Banana oats");
  });

  test("rejects cross-household planning and invalid slots", async () => {
    const recipes = await householdA.client.rpc("list_personal_recipes");
    const recipeId = recipes.data[0].id as string;
    const result = await householdB.client.rpc("plan_personal_recipe", {
      p_baby_id: babyAId,
      p_recipe_id: recipeId,
      p_local_date: "2026-08-10",
      p_meal_slot: "breakfast"
    });
    expect(result.error).not.toBeNull();
  });
});
