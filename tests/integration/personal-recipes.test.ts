import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  authenticatedClient,
  readLocalSupabaseStatus,
  waitForAuth,
  type LocalSupabaseStatus
} from "./support/local-supabase";

type TestUser = { id: string; client: SupabaseClient };

const createdUserIds: string[] = [];

describe("personal recipe persistence", () => {
  let status: LocalSupabaseStatus;
  let admin: SupabaseClient;
  let anonymous: SupabaseClient;
  let householdA: TestUser;
  let householdB: TestUser;

  async function createTestUser(label: string): Promise<TestUser> {
    const email = `recipe-${label}-${crypto.randomUUID()}@example.test`;
    const password = `Recipe-${crypto.randomUUID()}`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    expect(created.error).toBeNull();
    const userId = created.data.user!.id;
    createdUserIds.push(userId);

    const authClient = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const session = await authClient.auth.signInWithPassword({
      email,
      password
    });
    expect(session.error).toBeNull();
    return {
      id: userId,
      client: authenticatedClient(status, session.data.session!.access_token)
    };
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
    householdA = await createTestUser("a");
    householdB = await createTestUser("b");
    await Promise.all([
      householdA.client.rpc("bootstrap_account"),
      householdB.client.rpc("bootstrap_account")
    ]);
  });

  afterAll(async () => {
    await Promise.all(
      createdUserIds.map((userId) => admin.auth.admin.deleteUser(userId))
    );
  });

  test("stores editable recipes and isolates them by household", async () => {
    const inserted = await householdA.client
      .from("recipes")
      .insert({
        household_id: (
          await householdA.client
            .from("user_profiles")
            .select("household_id")
            .single()
        ).data!.household_id,
        title: "Tomato Pasta",
        ingredients: "Tomatoes\nPasta",
        instructions: "Boil and stir.",
        source_type: "imported",
        source_url: "https://example.com/tomato-pasta",
        source_title: "Example Kitchen",
        import_status: "confirmed",
        tags: ["quick", "family"]
      })
      .select("id, title, source_type, import_status, tags")
      .single();

    expect(inserted.error).toBeNull();
    expect(inserted.data).toEqual(
      expect.objectContaining({
        title: "Tomato Pasta",
        source_type: "imported",
        import_status: "confirmed",
        tags: ["quick", "family"]
      })
    );

    const recipeId = inserted.data!.id;
    const otherHouseholdRead = await householdB.client
      .from("recipes")
      .select("id")
      .eq("id", recipeId);
    expect(otherHouseholdRead.error).toBeNull();
    expect(otherHouseholdRead.data).toEqual([]);

    const anonymousRead = await anonymous.from("recipes").select("id");
    expect(anonymousRead.error?.code).toBe("42501");

    const crossHouseholdUpdate = await householdB.client
      .from("recipes")
      .update({ title: "Not mine" })
      .eq("id", recipeId)
      .select("id");
    expect(crossHouseholdUpdate.error).toBeNull();
    expect(crossHouseholdUpdate.data).toEqual([]);

    const ownUpdate = await householdA.client
      .from("recipes")
      .update({ is_favorite: true, tags: ["quick"] })
      .eq("id", recipeId)
      .select("is_favorite, tags")
      .single();
    expect(ownUpdate.error).toBeNull();
    expect(ownUpdate.data).toEqual({ is_favorite: true, tags: ["quick"] });
  });

  test("stores one recipe per date and meal slot with private prepared notes", async () => {
    const profile = await householdA.client
      .from("user_profiles")
      .select("household_id")
      .single();
    const recipe = await householdA.client
      .from("recipes")
      .insert({
        household_id: profile.data!.household_id,
        title: "Oatmeal",
        ingredients: "Oats",
        instructions: "Cook oats.",
        source_type: "manual"
      })
      .select("id")
      .single();
    expect(recipe.error).toBeNull();

    const slot = await householdA.client
      .from("recipe_week_slots")
      .insert({
        household_id: profile.data!.household_id,
        recipe_id: recipe.data!.id,
        local_date: "2026-08-12",
        meal_slot: "breakfast",
        note: "Try this tomorrow"
      })
      .select("id, status")
      .single();
    expect(slot.error).toBeNull();
    expect(slot.data?.status).toBe("planned");

    const duplicateSlot = await householdA.client
      .from("recipe_week_slots")
      .insert({
        household_id: profile.data!.household_id,
        recipe_id: recipe.data!.id,
        local_date: "2026-08-12",
        meal_slot: "breakfast"
      });
    expect(duplicateSlot.error?.code).toBe("23505");

    const note = await householdA.client
      .from("prepared_notes")
      .insert({
        household_id: profile.data!.household_id,
        recipe_id: recipe.data!.id,
        week_slot_id: slot.data!.id,
        status: "prepared",
        portion_count: 3,
        notes: "Made ahead."
      })
      .select("status, portion_count, notes")
      .single();
    expect(note.error).toBeNull();
    expect(note.data).toEqual({
      status: "prepared",
      portion_count: 3,
      notes: "Made ahead."
    });
  });

  test("ownership triggers protect cross-household planning and image metadata", async () => {
    const profileA = await householdA.client
      .from("user_profiles")
      .select("household_id")
      .single();
    const profileB = await householdB.client
      .from("user_profiles")
      .select("household_id")
      .single();
    const recipeA = await householdA.client
      .from("recipes")
      .select("id")
      .limit(1)
      .single();
    expect(recipeA.error).toBeNull();

    const recipeAWithoutImage = await householdA.client
      .from("recipes")
      .insert({
        household_id: profileA.data!.household_id,
        title: "Image ownership fixture",
        ingredients: "Ingredient",
        instructions: "Instruction",
        source_type: "manual"
      })
      .select("id")
      .single();
    expect(recipeAWithoutImage.error).toBeNull();

    const crossHouseholdSlot = await householdB.client
      .from("recipe_week_slots")
      .insert({
        household_id: profileB.data!.household_id,
        recipe_id: recipeAWithoutImage.data!.id,
        local_date: "2026-08-14",
        meal_slot: "lunch"
      });
    expect(crossHouseholdSlot.error?.code).toMatch(/23503|42501/);

    const ownImage = await householdA.client
      .from("recipe_images")
      .insert({
        household_id: profileA.data!.household_id,
        recipe_id: recipeA.data!.id,
        source_type: "external",
        external_url: "https://example.com/recipe.webp",
        alt_text: "A recipe image"
      })
      .select("id, source_type, external_url")
      .single();
    expect(ownImage.error).toBeNull();

    const crossHouseholdImage = await householdB.client
      .from("recipe_images")
      .insert({
        household_id: profileB.data!.household_id,
        recipe_id: recipeAWithoutImage.data!.id,
        source_type: "external",
        external_url: "https://example.com/not-mine.webp",
        alt_text: "Not mine"
      });
    expect(crossHouseholdImage.error?.code).toMatch(/23503|42501/);

    const hiddenImage = await householdB.client
      .from("recipe_images")
      .select("id")
      .eq("id", ownImage.data!.id);
    expect(hiddenImage.error).toBeNull();
    expect(hiddenImage.data).toEqual([]);
  });
});
