import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  authenticatedClient,
  type LocalSupabaseStatus,
  readLocalSupabaseStatus,
  waitForAuth
} from "./support/local-supabase";

type TestUser = {
  id: string;
  email: string;
  client: SupabaseClient;
};

const createdUserIds: string[] = [];

describe("authenticated baby profile", () => {
  let status: LocalSupabaseStatus;
  let admin: SupabaseClient;
  let anonymous: SupabaseClient;
  let householdA: TestUser;
  let householdB: TestUser;

  async function createTestUser(label: string): Promise<TestUser> {
    const email = `ticket-02-${label}-${crypto.randomUUID()}@example.test`;
    const password = `Ticket-02-${crypto.randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    expect(error).toBeNull();
    expect(data.user).not.toBeNull();

    const userId = data.user!.id;
    createdUserIds.push(userId);

    const authClient = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: sessionData, error: sessionError } =
      await authClient.auth.signInWithPassword({ email, password });

    expect(sessionError).toBeNull();
    expect(sessionData.session).not.toBeNull();

    return {
      id: userId,
      email,
      client: authenticatedClient(status, sessionData.session!.access_token)
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
    householdA = await createTestUser("household-a");
    householdB = await createTestUser("household-b");
  });

  afterAll(async () => {
    await Promise.all(
      createdUserIds.map((userId) => admin.auth.admin.deleteUser(userId))
    );
  });

  test("a retried bootstrap creates exactly one linked household and user profile", async () => {
    const [first, retry] = await Promise.all([
      householdA.client.rpc("bootstrap_account"),
      householdA.client.rpc("bootstrap_account")
    ]);

    expect(first.error).toBeNull();
    expect(retry.error).toBeNull();
    expect(first.data).toEqual(retry.data);

    const { data: profiles, error: profileError } = await householdA.client
      .from("user_profiles")
      .select("user_id, household_id");

    expect(profileError).toBeNull();
    expect(profiles).toHaveLength(1);
    expect(profiles?.[0]?.user_id).toBe(householdA.id);

    const { data: households, error: householdError } = await householdA.client
      .from("households")
      .select("id");

    expect(householdError).toBeNull();
    expect(households).toEqual([{ id: profiles?.[0]?.household_id }]);
  });

  test("profile setup creates one active baby and a retry updates that baby", async () => {
    await householdA.client.rpc("bootstrap_account");

    const first = await householdA.client.rpc("complete_baby_profile", {
      p_nickname: null,
      p_birth_date: "2025-10-15",
      p_time_zone: "America/Chicago",
      p_feeding_style: "mixed",
      p_meal_slots: ["breakfast", "dinner"]
    });

    expect(first.error).toBeNull();

    const retry = await householdA.client.rpc("complete_baby_profile", {
      p_nickname: "Juniper",
      p_birth_date: "2025-10-15",
      p_time_zone: "America/New_York",
      p_feeding_style: "finger_foods",
      p_meal_slots: ["breakfast", "lunch", "dinner"]
    });

    expect(retry.error).toBeNull();
    expect(retry.data).toEqual(first.data);

    const { data: babies, error } = await householdA.client
      .from("babies")
      .select(
        "id, nickname, birth_date, time_zone, feeding_style, meal_slots, is_active"
      );

    expect(error).toBeNull();
    expect(babies).toEqual([
      {
        id: first.data,
        nickname: "Juniper",
        birth_date: "2025-10-15",
        time_zone: "America/New_York",
        feeding_style: "finger_foods",
        meal_slots: ["breakfast", "lunch", "dinner"],
        is_active: true
      }
    ]);

    const invalidUpdate = await householdA.client.rpc("complete_baby_profile", {
      p_nickname: "Should not persist",
      p_birth_date: "2025-09-20",
      p_time_zone: "Not/A_Time_Zone",
      p_feeding_style: "spoon_fed",
      p_meal_slots: ["lunch"]
    });

    expect(invalidUpdate.error?.message).toMatch(/time zone/i);

    const { data: babiesAfterInvalidUpdate, error: invalidReadError } =
      await householdA.client
        .from("babies")
        .select(
          "id, nickname, birth_date, time_zone, feeding_style, meal_slots, is_active"
        );

    expect(invalidReadError).toBeNull();
    expect(babiesAfterInvalidUpdate).toEqual(babies);
  });

  test("invalid setup rolls back without leaving partial baby state", async () => {
    const user = await createTestUser("atomicity");
    await user.client.rpc("bootstrap_account");

    const result = await user.client.rpc("complete_baby_profile", {
      p_nickname: "Test baby",
      p_birth_date: "2025-10-15",
      p_time_zone: "Not/A_Time_Zone",
      p_feeding_style: "mixed",
      p_meal_slots: ["breakfast"]
    });

    expect(result.error?.message).toMatch(/time zone/i);

    const { data: profiles } = await user.client
      .from("user_profiles")
      .select("user_id, household_id");
    const { data: households } = await user.client
      .from("households")
      .select("id");
    const { data: babies } = await user.client.from("babies").select("id");

    expect(profiles).toHaveLength(1);
    expect(households).toEqual([{ id: profiles?.[0]?.household_id }]);
    expect(babies).toEqual([]);
  });

  test("anonymous and other households cannot read or mutate child profile data", async () => {
    await householdB.client.rpc("bootstrap_account");

    const { data: ownProfile } = await householdA.client
      .from("user_profiles")
      .select("user_id, household_id")
      .single();
    const { data: ownBaby } = await householdA.client
      .from("babies")
      .select("id")
      .single();

    for (const table of ["households", "user_profiles", "babies"] as const) {
      const anonymousRead = await anonymous.from(table).select("*");
      expect(anonymousRead.error?.code).toBe("42501");
    }

    const anonymousBootstrap = await anonymous.rpc("bootstrap_account");
    expect(anonymousBootstrap.error?.code).toBe("42501");

    const crossHouseholdRead = await householdB.client
      .from("babies")
      .select("id")
      .eq("id", ownBaby!.id);
    expect(crossHouseholdRead.error).toBeNull();
    expect(crossHouseholdRead.data).toEqual([]);

    const crossHouseholdProfileRead = await householdB.client
      .from("user_profiles")
      .select("user_id")
      .eq("user_id", ownProfile!.user_id);
    expect(crossHouseholdProfileRead.error).toBeNull();
    expect(crossHouseholdProfileRead.data).toEqual([]);

    const crossHouseholdReadModel = await householdB.client
      .from("households")
      .select("id")
      .eq("id", ownProfile!.household_id);
    expect(crossHouseholdReadModel.error).toBeNull();
    expect(crossHouseholdReadModel.data).toEqual([]);

    const crossHouseholdMutation = await householdB.client
      .from("babies")
      .update({ nickname: "Not mine" })
      .eq("id", ownBaby!.id)
      .select("id");
    expect(crossHouseholdMutation.error?.code).toBe("42501");

    const directInsert = await householdB.client.from("babies").insert({
      household_id: ownProfile!.household_id,
      nickname: "Bypass",
      birth_date: "2025-10-15",
      time_zone: "America/Chicago",
      feeding_style: "mixed",
      meal_slots: ["breakfast"]
    });
    expect(directInsert.error?.code).toBe("42501");
  });
});
