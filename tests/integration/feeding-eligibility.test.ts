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
  client: SupabaseClient;
};

const createdUserIds: string[] = [];

function approvedFixture() {
  const foods = Array.from({ length: 16 }, (_, index) => ({
    id: `food-ticket-04-${index + 1}`,
    slug: `ticket-04-food-${index + 1}`,
    name: `Ticket 04 Food ${String(index + 1).padStart(2, "0")}`,
    category: "synthetic-test-fixture"
  }));

  return {
    sources: [
      {
        id: "source-ticket-04",
        publisher: "Synthetic Ticket 04 publisher",
        title: "Synthetic Ticket 04 source",
        url: "https://example.test/ticket-04",
        source_date: "2026-01-01",
        accessed_at: "2026-07-27"
      }
    ],
    tags: [
      {
        id: "skill-ticket-04-sit",
        kind: "skill",
        label: "Synthetic supported sitting ability"
      },
      {
        id: "skill-ticket-04-move-food",
        kind: "skill",
        label: "Synthetic move-food ability"
      },
      {
        id: "allergen-ticket-04",
        kind: "allergen",
        label: "Synthetic allergen marker"
      }
    ],
    foods,
    preparations: [
      ...foods.map((food, index) => ({
        id: `prep-ticket-04-${index + 1}`,
        food_id: food.id,
        slug: `ticket-04-preparation-${index + 1}`,
        name: `Ticket 04 Preparation ${String(index + 1).padStart(2, "0")}`,
        is_active: true
      })),
      {
        id: "prep-ticket-04-draft",
        food_id: foods[0].id,
        slug: "ticket-04-draft",
        name: "Ticket 04 Draft",
        is_active: true
      }
    ],
    revisions: [
      ...foods.map((_, index) => ({
        id: `revision-ticket-04-${index + 1}`,
        preparation_id: `prep-ticket-04-${index + 1}`,
        version: 1,
        status: "approved",
        method: "SYNTHETIC TEST METHOD",
        shape_texture: "SYNTHETIC TEST TEXTURE",
        source_id: "source-ticket-04",
        reviewer_role: "synthetic_test_reviewer",
        reviewed_at: "2026-07-27",
        approved_at: "2026-07-27",
        next_review_at: "2027-07-27",
        tag_ids:
          index === 0
            ? [
                "skill-ticket-04-sit",
                "skill-ticket-04-move-food",
                "allergen-ticket-04"
              ]
            : ["skill-ticket-04-sit", "allergen-ticket-04"],
        visual_required: false,
        visual_ids: [],
        preparation_time_band: "under_15_minutes",
        storage_rules: [
          {
            id: `rule-ticket-04-${index + 1}`,
            support_status: "unsupported",
            deadline_kind: null,
            duration_hours: null,
            guidance: null
          }
        ]
      })),
      {
        id: "revision-ticket-04-draft",
        preparation_id: "prep-ticket-04-draft",
        version: 1,
        status: "draft",
        method: "SYNTHETIC TEST METHOD",
        shape_texture: "SYNTHETIC TEST TEXTURE",
        source_id: "source-ticket-04",
        reviewer_role: null,
        reviewed_at: null,
        approved_at: null,
        next_review_at: null,
        tag_ids: ["skill-ticket-04-sit", "allergen-ticket-04"],
        visual_required: false,
        visual_ids: [],
        preparation_time_band: "under_15_minutes",
        storage_rules: [
          {
            id: "rule-ticket-04-draft",
            support_status: "unsupported",
            deadline_kind: null,
            duration_hours: null,
            guidance: null
          }
        ]
      }
    ],
    retirements: []
  };
}

function exposureOptionChurnFixture() {
  return {
    sources: [
      {
        id: "source-ticket-04",
        publisher: "Synthetic Ticket 04 publisher",
        title: "Synthetic Ticket 04 source",
        url: "https://example.test/ticket-04",
        source_date: "2026-01-01",
        accessed_at: "2026-07-27"
      }
    ],
    tags: [
      {
        id: "skill-ticket-04-sit",
        kind: "skill",
        label: "Synthetic supported sitting ability"
      },
      {
        id: "allergen-ticket-04",
        kind: "allergen",
        label: "Synthetic allergen marker"
      }
    ],
    foods: [
      {
        id: "food-ticket-04-00",
        slug: "ticket-04-food-00",
        name: "AAA Ticket 04 Food",
        category: "synthetic-test-fixture"
      }
    ],
    preparations: [
      {
        id: "prep-ticket-04-00",
        food_id: "food-ticket-04-00",
        slug: "ticket-04-preparation-00",
        name: "Ticket 04 Preparation 00",
        is_active: true
      }
    ],
    revisions: [
      {
        id: "revision-ticket-04-00",
        preparation_id: "prep-ticket-04-00",
        version: 1,
        status: "approved",
        method: "SYNTHETIC TEST METHOD",
        shape_texture: "SYNTHETIC TEST TEXTURE",
        source_id: "source-ticket-04",
        reviewer_role: "synthetic_test_reviewer",
        reviewed_at: "2026-07-27",
        approved_at: "2026-07-27",
        next_review_at: "2027-07-27",
        tag_ids: ["skill-ticket-04-sit", "allergen-ticket-04"],
        visual_required: false,
        visual_ids: [],
        preparation_time_band: "under_15_minutes",
        storage_rules: [
          {
            id: "rule-ticket-04-00",
            support_status: "unsupported",
            deadline_kind: null,
            duration_hours: null,
            guidance: null
          }
        ]
      }
    ],
    retirements: []
  };
}

describe("feeding eligibility configuration", () => {
  let status: LocalSupabaseStatus;
  let admin: SupabaseClient;
  let anonymous: SupabaseClient;
  let householdA: TestUser;
  let householdB: TestUser;
  let babyAId: string;
  let fixtureImported = false;

  async function createTestUser(label: string): Promise<TestUser> {
    const email = `ticket-04-${label}-${crypto.randomUUID()}@example.test`;
    const password = `Ticket-04-${crypto.randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    expect(error).toBeNull();
    expect(data.user).not.toBeNull();
    createdUserIds.push(data.user!.id);

    const authClient = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: sessionData, error: sessionError } =
      await authClient.auth.signInWithPassword({ email, password });

    expect(sessionError).toBeNull();
    expect(sessionData.session).not.toBeNull();

    return {
      id: data.user!.id,
      client: authenticatedClient(status, sessionData.session!.access_token)
    };
  }

  async function createBaby(user: TestUser, nickname: string) {
    await user.client.rpc("bootstrap_account");
    const result = await user.client.rpc("complete_baby_profile", {
      p_nickname: nickname,
      p_birth_date: "2025-10-15",
      p_time_zone: "America/Chicago",
      p_feeding_style: "mixed",
      p_meal_slots: ["breakfast", "dinner"]
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
    const imported = await admin.rpc("import_catalog_fixture", {
      p_fixture: approvedFixture()
    });
    fixtureImported = imported.error === null;
    expect(imported.error).toBeNull();

    householdA = await createTestUser("household-a");
    householdB = await createTestUser("household-b");
    babyAId = await createBaby(householdA, "Juniper");
    await createBaby(householdB, "Other baby");
  });

  afterAll(async () => {
    await Promise.all(
      createdUserIds.map((userId) => admin.auth.admin.deleteUser(userId))
    );
    if (!fixtureImported) {
      return;
    }

    const approvedRevisions = [
      ...Array.from(
        { length: 16 },
        (_, index) => `revision-ticket-04-${index + 1}`
      ),
      "revision-ticket-04-00"
    ];
    const existingRetirements = await admin
      .from("content_retirements")
      .select("revision_id")
      .in("revision_id", approvedRevisions);
    expect(existingRetirements.error).toBeNull();
    const retiredRevisionIds = new Set(
      (existingRetirements.data ?? []).map(({ revision_id }) => revision_id)
    );
    const missingRetirements = approvedRevisions
      .filter((revisionId) => !retiredRevisionIds.has(revisionId))
      .map((revisionId) => ({
        revision_id: revisionId,
        retired_at: "2026-07-27",
        reason: "SYNTHETIC TEST FIXTURE CLEANUP"
      }));
    if (missingRetirements.length > 0) {
      const retired = await admin
        .from("content_retirements")
        .insert(missingRetirements);
      expect(retired.error).toBeNull();
    }
  });

  test("configuration records conservative ability, restriction, exposure, preferences, and backups and can be revised", async () => {
    const first = await householdA.client.rpc("save_feeding_configuration", {
      p_skill_statuses: [
        { skill_id: "skill-ticket-04-sit", status: "observed" },
        { skill_id: "skill-ticket-04-move-food", status: "not_sure" }
      ],
      p_restrictions: [
        {
          food_id: "food-ticket-04-1",
          status: "no_known_restriction"
        }
      ],
      p_exposures: [
        { food_id: "food-ticket-04-1", state: "unknown" },
        { food_id: "food-ticket-04-2", state: "not_tried" }
      ],
      p_new_food_pace: "one_per_week",
      p_preparation_time: "under_30_minutes",
      p_prep_day: 6,
      p_quick_backup_food_ids: ["food-ticket-04-1", "food-ticket-04-2"]
    });

    expect(first.error).toBeNull();

    const loaded = await householdA.client.rpc("get_feeding_configuration");
    expect(loaded.error).toBeNull();
    expect(loaded.data.preferences).toEqual({
      new_food_pace: "one_per_week",
      preparation_time: "under_30_minutes",
      prep_day: 6
    });
    expect(loaded.data.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "skill-ticket-04-sit",
          status: "observed"
        }),
        expect.objectContaining({
          id: "skill-ticket-04-move-food",
          status: "not_sure"
        })
      ])
    );
    expect(loaded.data.foods).toHaveLength(16);
    expect(loaded.data.foods[0]).toEqual(
      expect.objectContaining({
        id: "food-ticket-04-1",
        exposure_state: "unknown",
        exposure_selectable: true,
        restriction_status: "no_known_restriction",
        is_quick_backup: true
      })
    );
    expect(loaded.data.foods[1]).toEqual(
      expect.objectContaining({
        id: "food-ticket-04-2",
        exposure_state: "not_tried",
        exposure_selectable: true,
        restriction_status: null,
        is_quick_backup: true
      })
    );

    const revised = await householdA.client.rpc("save_feeding_configuration", {
      p_skill_statuses: [
        { skill_id: "skill-ticket-04-sit", status: "not_observed" },
        { skill_id: "skill-ticket-04-move-food", status: "observed" }
      ],
      p_restrictions: [
        {
          food_id: "food-ticket-04-1",
          status: "temporary_avoidance"
        },
        {
          food_id: "food-ticket-04-16",
          status: "no_known_restriction"
        }
      ],
      p_exposures: [
        { food_id: "food-ticket-04-1", state: "liked" },
        { food_id: "food-ticket-04-15", state: "neutral" }
      ],
      p_new_food_pace: "two_per_week",
      p_preparation_time: "under_15_minutes",
      p_prep_day: null,
      p_quick_backup_food_ids: ["food-ticket-04-1", "food-ticket-04-16"]
    });
    expect(revised.error).toBeNull();

    const reloaded = await householdA.client.rpc("get_feeding_configuration");
    expect(reloaded.data.preferences).toEqual({
      new_food_pace: "two_per_week",
      preparation_time: "under_15_minutes",
      prep_day: null
    });
    expect(reloaded.data.foods[0]).toEqual(
      expect.objectContaining({
        exposure_state: "liked",
        restriction_status: "temporary_avoidance",
        is_quick_backup: true
      })
    );
    expect(reloaded.data.foods[1]).toEqual(
      expect.objectContaining({
        exposure_state: null,
        restriction_status: null,
        is_quick_backup: false
      })
    );
    expect(reloaded.data.foods[15]).toEqual(
      expect.objectContaining({
        id: "food-ticket-04-16",
        exposure_state: null,
        exposure_selectable: false,
        restriction_status: "no_known_restriction",
        is_quick_backup: true
      })
    );
  });

  test("exposure history survives when catalog ordering moves a food outside the 15-food quick-select", async () => {
    const imported = await admin.rpc("import_catalog_fixture", {
      p_fixture: exposureOptionChurnFixture()
    });
    expect(imported.error).toBeNull();

    const afterPublication = await householdA.client.rpc(
      "get_feeding_configuration"
    );
    expect(
      afterPublication.data.foods.find(
        (food: { id: string }) => food.id === "food-ticket-04-15"
      )
    ).toEqual(
      expect.objectContaining({
        exposure_state: "neutral",
        exposure_selectable: false
      })
    );

    const unrelatedSave = await householdA.client.rpc(
      "save_feeding_configuration",
      {
        p_skill_statuses: [
          { skill_id: "skill-ticket-04-sit", status: "not_observed" },
          { skill_id: "skill-ticket-04-move-food", status: "observed" }
        ],
        p_restrictions: [
          {
            food_id: "food-ticket-04-1",
            status: "temporary_avoidance"
          },
          {
            food_id: "food-ticket-04-16",
            status: "no_known_restriction"
          }
        ],
        p_exposures: [{ food_id: "food-ticket-04-1", state: "liked" }],
        p_new_food_pace: "three_per_week",
        p_preparation_time: "flexible",
        p_prep_day: 1,
        p_quick_backup_food_ids: ["food-ticket-04-1", "food-ticket-04-16"]
      }
    );
    expect(unrelatedSave.error).toBeNull();

    const afterSave = await householdA.client.rpc("get_feeding_configuration");
    expect(
      afterSave.data.foods.find(
        (food: { id: string }) => food.id === "food-ticket-04-15"
      )
    ).toEqual(
      expect.objectContaining({
        exposure_state: "neutral",
        exposure_selectable: false
      })
    );
  });

  test("missing or uncertain abilities, unknown safety state, and every blocking restriction fail closed", async () => {
    const missingSafetyState = await householdB.client.rpc(
      "get_preparation_eligibility",
      { p_slug: "ticket-04-preparation-1" }
    );
    expect(missingSafetyState.error).toBeNull();
    expect(missingSafetyState.data).toEqual({
      status: "ineligible",
      reason: "restriction_status_unknown"
    });

    const uncertain = await householdB.client.rpc(
      "save_feeding_configuration",
      {
        p_skill_statuses: [
          { skill_id: "skill-ticket-04-sit", status: "observed" },
          { skill_id: "skill-ticket-04-move-food", status: "not_sure" }
        ],
        p_restrictions: [
          {
            food_id: "food-ticket-04-1",
            status: "no_known_restriction"
          }
        ],
        p_exposures: [],
        p_new_food_pace: "one_per_week",
        p_preparation_time: "under_30_minutes",
        p_prep_day: null,
        p_quick_backup_food_ids: []
      }
    );
    expect(uncertain.error).toBeNull();

    const uncertainEligibility = await householdB.client.rpc(
      "get_preparation_eligibility",
      { p_slug: "ticket-04-preparation-1" }
    );
    expect(uncertainEligibility.data).toEqual({
      status: "ineligible",
      reason: "required_ability_not_observed"
    });

    for (const restriction of [
      "confirmed_allergy",
      "directed_exclusion",
      "temporary_avoidance"
    ]) {
      const saved = await householdA.client.rpc("save_feeding_configuration", {
        p_skill_statuses: [
          { skill_id: "skill-ticket-04-sit", status: "observed" },
          {
            skill_id: "skill-ticket-04-move-food",
            status: "observed"
          }
        ],
        p_restrictions: [{ food_id: "food-ticket-04-1", status: restriction }],
        p_exposures: [{ food_id: "food-ticket-04-1", state: "liked" }],
        p_new_food_pace: "one_per_week",
        p_preparation_time: "under_30_minutes",
        p_prep_day: null,
        p_quick_backup_food_ids: []
      });
      expect(saved.error).toBeNull();

      const eligibility = await householdA.client.rpc(
        "get_preparation_eligibility",
        { p_slug: "ticket-04-preparation-1" }
      );
      expect(eligibility.data).toEqual({
        status: "ineligible",
        reason: "food_restricted"
      });
    }

    const observed = await householdA.client.rpc("save_feeding_configuration", {
      p_skill_statuses: [
        { skill_id: "skill-ticket-04-sit", status: "observed" },
        { skill_id: "skill-ticket-04-move-food", status: "observed" }
      ],
      p_restrictions: [
        {
          food_id: "food-ticket-04-1",
          status: "no_known_restriction"
        }
      ],
      p_exposures: [{ food_id: "food-ticket-04-1", state: "disliked" }],
      p_new_food_pace: "one_per_week",
      p_preparation_time: "under_30_minutes",
      p_prep_day: null,
      p_quick_backup_food_ids: []
    });
    expect(observed.error).toBeNull();

    const eligible = await householdA.client.rpc(
      "get_preparation_eligibility",
      { p_slug: "ticket-04-preparation-1" }
    );
    expect(eligible.data).toEqual({ status: "eligible" });
  });

  test("unpublished content, excessive selections, and unsupported identifiers are rejected atomically", async () => {
    const before = await householdA.client.rpc("get_feeding_configuration");

    const tooManyExposures = await householdA.client.rpc(
      "save_feeding_configuration",
      {
        p_skill_statuses: [],
        p_restrictions: [],
        p_exposures: Array.from({ length: 16 }, (_, index) => ({
          food_id: `food-ticket-04-${index + 1}`,
          state: "unknown"
        })),
        p_new_food_pace: "one_per_week",
        p_preparation_time: "under_30_minutes",
        p_prep_day: null,
        p_quick_backup_food_ids: []
      }
    );
    expect(tooManyExposures.error?.message).toMatch(/15/);

    const tooManyBackups = await householdA.client.rpc(
      "save_feeding_configuration",
      {
        p_skill_statuses: [],
        p_restrictions: [],
        p_exposures: [],
        p_new_food_pace: "one_per_week",
        p_preparation_time: "under_30_minutes",
        p_prep_day: null,
        p_quick_backup_food_ids: Array.from(
          { length: 9 },
          (_, index) => `food-ticket-04-${index + 1}`
        )
      }
    );
    expect(tooManyBackups.error?.message).toMatch(/eight/i);

    const unsupportedSkill = await householdA.client.rpc(
      "save_feeding_configuration",
      {
        p_skill_statuses: [
          { skill_id: "skill-not-reviewed", status: "observed" }
        ],
        p_restrictions: [],
        p_exposures: [],
        p_new_food_pace: "one_per_week",
        p_preparation_time: "under_30_minutes",
        p_prep_day: null,
        p_quick_backup_food_ids: []
      }
    );
    expect(unsupportedSkill.error?.message).toMatch(/reviewed ability/i);

    const after = await householdA.client.rpc("get_feeding_configuration");
    expect(after.data).toEqual(before.data);

    const unpublished = await householdA.client.rpc(
      "get_preparation_eligibility",
      { p_slug: "ticket-04-draft" }
    );
    expect(unpublished.data).toEqual({
      status: "unsupported",
      reason: "preparation_not_approved"
    });
  });

  test("RLS and commands prevent anonymous, direct-write, and cross-household bypasses", async () => {
    for (const table of [
      "baby_skills",
      "baby_food_restrictions",
      "baby_food_exposures",
      "baby_planning_preferences",
      "quick_backups"
    ] as const) {
      const anonymousRead = await anonymous.from(table).select("*");
      expect(anonymousRead.error?.code).toBe("42501");

      const crossHouseholdRead = await householdB.client
        .from(table)
        .select("*")
        .eq("baby_id", babyAId);
      expect(crossHouseholdRead.error).toBeNull();
      expect(crossHouseholdRead.data).toEqual([]);
    }

    const directWrite = await householdB.client.from("baby_skills").insert({
      baby_id: babyAId,
      skill_tag_id: "skill-ticket-04-sit",
      status: "observed"
    });
    expect(directWrite.error?.code).toBe("42501");

    const anonymousSave = await anonymous.rpc("save_feeding_configuration", {
      p_skill_statuses: [],
      p_restrictions: [],
      p_exposures: [],
      p_new_food_pace: "one_per_week",
      p_preparation_time: "under_30_minutes",
      p_prep_day: null,
      p_quick_backup_food_ids: []
    });
    expect(anonymousSave.error?.code).toBe("42501");
  });

  test("reaction-reported safety state blocks eligibility and cannot be cleared by ordinary editing", async () => {
    await admin.from("baby_food_restrictions").upsert({
      baby_id: babyAId,
      food_id: "food-ticket-04-1",
      status: "reaction_reported"
    });

    const eligibility = await householdA.client.rpc(
      "get_preparation_eligibility",
      { p_slug: "ticket-04-preparation-1" }
    );
    expect(eligibility.data).toEqual({
      status: "ineligible",
      reason: "food_restricted"
    });

    const attemptedClear = await householdA.client.rpc(
      "save_feeding_configuration",
      {
        p_skill_statuses: [
          { skill_id: "skill-ticket-04-sit", status: "observed" },
          { skill_id: "skill-ticket-04-move-food", status: "observed" }
        ],
        p_restrictions: [
          {
            food_id: "food-ticket-04-1",
            status: "no_known_restriction"
          }
        ],
        p_exposures: [],
        p_new_food_pace: "one_per_week",
        p_preparation_time: "under_30_minutes",
        p_prep_day: null,
        p_quick_backup_food_ids: []
      }
    );
    expect(attemptedClear.error?.message).toMatch(/reaction/i);

    const { data: restriction } = await admin
      .from("baby_food_restrictions")
      .select("status")
      .eq("baby_id", babyAId)
      .eq("food_id", "food-ticket-04-1")
      .single();
    expect(restriction).toEqual({ status: "reaction_reported" });
  });
});
