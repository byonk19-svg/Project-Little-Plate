import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { buildPlannerGenerationAttempt } from "../../src/modules/planner/generation";
import {
  authenticatedClient,
  type LocalSupabaseStatus,
  readLocalSupabaseStatus,
  waitForAuth
} from "./support/local-supabase";

type TestUser = { id: string; client: SupabaseClient };

const createdUserIds: string[] = [];

function fixture() {
  return {
    sources: [
      {
        id: "source-ticket-14",
        publisher: "Synthetic Ticket 14 publisher",
        title: "Synthetic Ticket 14 source",
        url: "https://example.test/ticket-14",
        source_date: "2026-01-01",
        accessed_at: "2026-07-28"
      }
    ],
    tags: [
      {
        id: "skill-ticket-14",
        kind: "skill",
        label: "Synthetic Ticket 14 observed ability"
      },
      {
        id: "allergen-ticket-14",
        kind: "allergen",
        label: "Synthetic Ticket 14 allergen marker"
      }
    ],
    foods: [1, 2, 3, 4].map((number) => ({
      id: `food-ticket-14-${number}`,
      slug: `ticket-14-food-${number}`,
      name: `Ticket 14 Food ${number}`,
      category: "synthetic-test-fixture"
    })),
    preparations: [1, 2, 3, 4].map((number) => ({
      id: `prep-ticket-14-${number}`,
      food_id: `food-ticket-14-${number}`,
      slug: `ticket-14-preparation-${number}`,
      name: `Ticket 14 Preparation ${number}`,
      is_active: true
    })),
    revisions: [1, 2, 3, 4].map((number) => ({
      id: `revision-ticket-14-${number}`,
      preparation_id: `prep-ticket-14-${number}`,
      version: 1,
      status: "approved",
      method: `SYNTHETIC TICKET 14 METHOD ${number}`,
      shape_texture: `SYNTHETIC TICKET 14 TEXTURE ${number}`,
      source_id: "source-ticket-14",
      reviewer_role: "synthetic_test_reviewer",
      reviewed_at: "2026-07-28",
      approved_at: "2026-07-28",
      next_review_at: number === 3 ? "2026-07-30" : "2027-07-28",
      tag_ids: ["skill-ticket-14", "allergen-ticket-14"],
      visual_required: false,
      visual_ids: [],
      preparation_time_band: "under_15_minutes",
      storage_rules: [
        {
          id: `rule-ticket-14-${number}`,
          support_status: "supported",
          deadline_kind: "discard_after",
          duration_hours: 240,
          guidance: "SYNTHETIC TEST-ONLY STORAGE GUIDANCE"
        }
      ]
    })),
    retirements: []
  };
}

describe("transactional planner generation", () => {
  let status: LocalSupabaseStatus;
  let admin: SupabaseClient;
  let fixtureImported = false;

  async function createUser(label: string): Promise<TestUser> {
    const email = `ticket-14-${label}-${crypto.randomUUID()}@example.test`;
    const password = `Ticket-14-${crypto.randomUUID()}`;
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
    const session = await authClient.auth.signInWithPassword({
      email,
      password
    });
    expect(session.error).toBeNull();
    return {
      id: created.data.user!.id,
      client: authenticatedClient(status, session.data.session!.access_token)
    };
  }

  async function configureUser(
    label: string,
    restriction = "no_known_restriction"
  ): Promise<TestUser> {
    const user = await createUser(label);
    expect((await user.client.rpc("bootstrap_account")).error).toBeNull();
    expect(
      (
        await user.client.rpc("complete_baby_profile", {
          p_nickname: "Planner baby",
          p_birth_date: "2025-10-15",
          p_time_zone: "America/Chicago",
          p_feeding_style: "mixed",
          p_meal_slots: ["breakfast"]
        })
      ).error
    ).toBeNull();
    expect(
      (
        await user.client.rpc("save_feeding_configuration", {
          p_skill_statuses: [
            { skill_id: "skill-ticket-14", status: "observed" }
          ],
          p_restrictions: [1, 2, 3, 4].map((number) => ({
            food_id: `food-ticket-14-${number}`,
            status: restriction
          })),
          p_exposures: [1, 2, 3, 4].map((number) => ({
            food_id: `food-ticket-14-${number}`,
            state: number === 1 ? "liked" : "not_tried"
          })),
          p_new_food_pace: "one_per_week",
          p_preparation_time: "under_30_minutes",
          p_prep_day: null,
          p_quick_backup_food_ids: []
        })
      ).error
    ).toBeNull();
    return user;
  }

  async function generationAttempt(user: TestUser) {
    const referenceAt = new Date().toISOString();
    const snapshot = await user.client.rpc("get_planner_generation_snapshot", {
      p_reference_at: referenceAt
    });
    expect(snapshot.error).toBeNull();
    return buildPlannerGenerationAttempt(snapshot.data);
  }

  beforeAll(async () => {
    status = readLocalSupabaseStatus();
    await waitForAuth(status);
    admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const imported = await admin.rpc("import_catalog_fixture", {
      p_fixture: fixture()
    });
    expect(imported.error).toBeNull();
    fixtureImported = imported.error === null;
    expect(
      (
        await admin.rpc("import_storage_rule_profiles", {
          p_profiles: [1, 2, 3, 4].map((number) => ({
            id: `profile-ticket-14-${number}`,
            storage_rule_id: `rule-ticket-14-${number}`,
            content_revision_id: `revision-ticket-14-${number}`,
            storage_location: "refrigerator",
            start_event_kind: "prepared_or_opened",
            precedence: 0,
            duration_min_hours: 240,
            duration_max_hours: 240,
            source_id: "source-ticket-14",
            reviewer_role: "synthetic_test_reviewer",
            reviewed_at: "2026-07-28",
            approved_at: "2026-07-28",
            next_review_at: number === 4 ? "2026-07-30" : "2027-07-28"
          }))
        })
      ).error
    ).toBeNull();
  });

  afterAll(async () => {
    if (!admin) return;
    for (const userId of createdUserIds) {
      expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
    }
    if (!fixtureImported) return;
    const revisionIds = [1, 2, 3, 4].map(
      (number) => `revision-ticket-14-${number}`
    );
    const existing = await admin
      .from("content_retirements")
      .select("revision_id")
      .in("revision_id", revisionIds);
    expect(existing.error).toBeNull();
    const retired = new Set(
      (existing.data ?? []).map(({ revision_id }) => revision_id)
    );
    const missing = revisionIds
      .filter((revisionId) => !retired.has(revisionId))
      .map((revisionId) => ({
        revision_id: revisionId,
        retired_at: "2026-07-28",
        reason: "SYNTHETIC TEST FIXTURE CLEANUP"
      }));
    if (missing.length > 0) {
      expect(
        (await admin.from("content_retirements").insert(missing)).error
      ).toBeNull();
    }
  });

  test("commits, retries, regenerates locks, and synchronizes derivations", async () => {
    const user = await configureUser("complete");
    const first = await generationAttempt(user);
    expect(first.status).toBe("feasible");
    if (first.status !== "feasible") return;

    const idempotencyKey = crypto.randomUUID();
    const forged = structuredClone(first.output);
    forged.reproducibilityHash = "forged-client-hash";
    forged.ruleRevisionIds = ["forged-rule"];
    forged.explanations = {
      meals: [
        {
          mealId: "forged",
          components: [
            {
              position: 0,
              preparationId: "forged",
              messages: ["FORGED MEDICAL COPY"]
            }
          ]
        }
      ]
    };
    for (const meal of forged.plan.meals) {
      for (const component of meal.components) {
        component.reasonCodes = ["locked_by_caregiver"];
      }
    }
    const committed = await user.client.rpc("commit_generated_week", {
      p_expected_version: first.expectedVersion,
      p_input_token: first.inputToken,
      p_reference_at: first.referenceAt,
      p_output: forged,
      p_idempotency_key: idempotencyKey
    });
    expect(committed.error).toBeNull();
    expect(committed.data).toEqual(
      expect.objectContaining({ status: "committed", version: 1 })
    );

    const retried = await user.client.rpc("commit_generated_week", {
      p_expected_version: first.expectedVersion,
      p_input_token: first.inputToken,
      p_reference_at: first.referenceAt,
      p_output: forged,
      p_idempotency_key: idempotencyKey
    });
    expect(retried.error).toBeNull();
    expect(retried.data).toEqual(
      expect.objectContaining({
        status: "committed",
        version: 1,
        idempotent_retry: true
      })
    );
    const changedRetryOutput = structuredClone(forged);
    changedRetryOutput.plan.meals[0].components[0].preparationId =
      "changed-retry-preparation";
    const changedRetry = await user.client.rpc("commit_generated_week", {
      p_expected_version: first.expectedVersion,
      p_input_token: first.inputToken,
      p_reference_at: first.referenceAt,
      p_output: changedRetryOutput,
      p_idempotency_key: idempotencyKey
    });
    expect(changedRetry.error).toBeNull();
    expect(changedRetry.data.reason).toBe("idempotency_key_conflict");

    const week = await user.client.rpc("get_week_window", {
      p_window_start: null
    });
    expect(week.error).toBeNull();
    const metadata = await user.client.rpc("get_planner_generation_metadata");
    expect(metadata.error).toBeNull();
    expect(metadata.data).toEqual(
      expect.objectContaining({
        status: "ready",
        plan_id: week.data.plan_id,
        window_start: week.data.window_start,
        version: week.data.version
      })
    );
    expect(metadata.data.reproducibility_hash).not.toBe("forged-client-hash");
    expect(JSON.stringify(metadata.data.explanations)).not.toContain(
      "FORGED MEDICAL COPY"
    );
    expect(JSON.stringify(metadata.data.explanations)).not.toContain(
      "Keeps a choice you locked."
    );
    expect(JSON.stringify(metadata.data.explanations)).toContain(
      "Adds preparation work because no valid portion is available."
    );
    const storedPlan = await user.client
      .from("meal_plans")
      .select(
        "planner_reproducibility_hash,planner_rule_revision_ids,planner_explanations"
      )
      .eq("id", week.data.plan_id)
      .single();
    expect(storedPlan.error).toBeNull();
    expect(storedPlan.data?.planner_reproducibility_hash).not.toBe(
      "forged-client-hash"
    );
    expect(storedPlan.data?.planner_rule_revision_ids).not.toContain(
      "forged-rule"
    );
    expect(JSON.stringify(storedPlan.data?.planner_explanations)).not.toContain(
      "FORGED MEDICAL COPY"
    );
    expect(
      (
        await admin.from("meals").insert({
          plan_id: week.data.plan_id,
          local_date: "2026-07-01",
          meal_slot: "lunch",
          status: "planned",
          is_locked: false
        })
      ).error
    ).toBeNull();
    const metadataWithHistoricalMeal = await user.client.rpc(
      "get_planner_generation_metadata"
    );
    expect(metadataWithHistoricalMeal.error).toBeNull();
    expect(metadataWithHistoricalMeal.data).toEqual(
      expect.objectContaining({
        status: "ready",
        window_start: week.data.window_start,
        version: week.data.version
      })
    );
    const planned = week.data.days.flatMap(
      (day: { slots: unknown[] }) => day.slots
    );
    expect(
      planned.filter(
        (slot: { components: unknown[] }) => slot.components.length === 1
      )
    ).toHaveLength(7);

    const derived = await user.client.rpc("get_derived_work_and_groceries");
    expect(derived.error).toBeNull();
    expect(derived.data.preparation_tasks.length).toBeGreaterThan(0);
    expect(derived.data.derived_grocery_items.length).toBeGreaterThan(0);

    const firstMeal = week.data.days[0].slots[0];
    const locked = await user.client.rpc("edit_manual_week", {
      p_expected_version: 1,
      p_operation: "set_component_lock",
      p_payload: {
        component_id: firstMeal.components[0].component_id,
        locked: true
      },
      p_idempotency_key: crypto.randomUUID()
    });
    expect(locked.error).toBeNull();
    expect(locked.data.status).toBe("applied");
    expect(
      (await user.client.rpc("get_planner_generation_metadata")).data.status
    ).toBe("stale");

    const regeneration = await generationAttempt(user);
    expect(regeneration.status).toBe("feasible");
    if (regeneration.status !== "feasible") return;
    const regenerated = await user.client.rpc("commit_generated_week", {
      p_expected_version: regeneration.expectedVersion,
      p_input_token: regeneration.inputToken,
      p_reference_at: regeneration.referenceAt,
      p_output: regeneration.output,
      p_idempotency_key: crypto.randomUUID()
    });
    expect(regenerated.error).toBeNull();
    expect(regenerated.data.status).toBe("committed");

    const after = await user.client.rpc("get_week_window", {
      p_window_start: null
    });
    expect(after.error).toBeNull();
    expect(after.data.days[0].slots[0].components[0]).toEqual(
      expect.objectContaining({
        preparation_id: firstMeal.components[0].preparation_id,
        revision_id: firstMeal.components[0].revision_id,
        is_locked: true
      })
    );

    const mealToLock = after.data.days[1].slots[0];
    const expectedLockedMeal = structuredClone(mealToLock.components);
    const mealLocked = await user.client.rpc("edit_manual_week", {
      p_expected_version: after.data.version,
      p_operation: "set_meal_lock",
      p_payload: { meal_id: mealToLock.meal_id, locked: true },
      p_idempotency_key: crypto.randomUUID()
    });
    expect(mealLocked.error).toBeNull();
    const mealRegeneration = await generationAttempt(user);
    expect(mealRegeneration.status).toBe("feasible");
    if (mealRegeneration.status !== "feasible") return;
    const mealRegenerated = await user.client.rpc("commit_generated_week", {
      p_expected_version: mealRegeneration.expectedVersion,
      p_input_token: mealRegeneration.inputToken,
      p_reference_at: mealRegeneration.referenceAt,
      p_output: mealRegeneration.output,
      p_idempotency_key: crypto.randomUUID()
    });
    expect(mealRegenerated.error).toBeNull();
    expect(mealRegenerated.data.status).toBe("committed");
    const afterMealRegeneration = await user.client.rpc("get_week_window", {
      p_window_start: null
    });
    expect(afterMealRegeneration.error).toBeNull();
    expect(afterMealRegeneration.data.days[1].slots[0].is_locked).toBe(true);
    expect(afterMealRegeneration.data.days[1].slots[0].components).toEqual(
      expectedLockedMeal
    );
  });

  test("omits content and storage profiles whose review expires midweek", async () => {
    const user = await configureUser("review-window");
    const referenceAt = new Date().toISOString();
    const snapshot = await user.client.rpc("get_planner_generation_snapshot", {
      p_reference_at: referenceAt
    });
    expect(snapshot.error).toBeNull();
    expect(
      snapshot.data.candidates.map(
        (candidate: { preparation_id: string }) => candidate.preparation_id
      )
    ).toEqual(["prep-ticket-14-1", "prep-ticket-14-2", "prep-ticket-14-4"]);
    expect(
      snapshot.data.candidates.find(
        (candidate: { preparation_id: string }) =>
          candidate.preparation_id === "prep-ticket-14-4"
      ).refrigerator_profiles
    ).toEqual([]);
  });

  test("infeasible generation returns no output and leaves the week unchanged", async () => {
    const user = await configureUser("infeasible", "temporary_avoidance");
    const attempt = await generationAttempt(user);
    expect(attempt).toEqual({
      status: "infeasible",
      reason: "no_eligible_candidate"
    });
    const week = await user.client.rpc("get_week_window", {
      p_window_start: null
    });
    expect(week.error).toBeNull();
    expect(week.data.version).toBe(0);
    expect(
      week.data.days.flatMap(
        (day: { slots: Array<{ components: unknown[] }> }) =>
          day.slots.flatMap((slot) => slot.components)
      )
    ).toEqual([]);
  });

  test("rejects stale and tampered output and serializes concurrent commits", async () => {
    const staleUser = await configureUser("stale");
    const staleAttempt = await generationAttempt(staleUser);
    expect(staleAttempt.status).toBe("feasible");
    if (staleAttempt.status !== "feasible") return;
    expect(
      (
        await staleUser.client.rpc("save_feeding_configuration", {
          p_skill_statuses: [
            { skill_id: "skill-ticket-14", status: "observed" }
          ],
          p_restrictions: [1, 2].map((number) => ({
            food_id: `food-ticket-14-${number}`,
            status: "no_known_restriction"
          })),
          p_exposures: [1, 2].map((number) => ({
            food_id: `food-ticket-14-${number}`,
            state: "neutral"
          })),
          p_new_food_pace: "two_per_week",
          p_preparation_time: "under_30_minutes",
          p_prep_day: null,
          p_quick_backup_food_ids: []
        })
      ).error
    ).toBeNull();
    const stale = await staleUser.client.rpc("commit_generated_week", {
      p_expected_version: staleAttempt.expectedVersion,
      p_input_token: staleAttempt.inputToken,
      p_reference_at: staleAttempt.referenceAt,
      p_output: staleAttempt.output,
      p_idempotency_key: crypto.randomUUID()
    });
    expect(stale.error).toBeNull();
    expect(stale.data.reason).toBe("planner_input_stale");

    const concurrentUser = await configureUser("concurrent");
    const emptyWeek = await concurrentUser.client.rpc("get_week_window", {
      p_window_start: null
    });
    expect(emptyWeek.error).toBeNull();
    const targetDate = emptyWeek.data.window_start;
    const firstManual = await concurrentUser.client.rpc("edit_manual_week", {
      p_expected_version: 0,
      p_operation: "add_component",
      p_payload: {
        local_date: targetDate,
        meal_slot: "breakfast",
        preparation_slug: "ticket-14-preparation-1"
      },
      p_idempotency_key: crypto.randomUUID()
    });
    expect(firstManual.error).toBeNull();
    const secondManual = await concurrentUser.client.rpc("edit_manual_week", {
      p_expected_version: 1,
      p_operation: "add_component",
      p_payload: {
        local_date: targetDate,
        meal_slot: "breakfast",
        preparation_slug: "ticket-14-preparation-2"
      },
      p_idempotency_key: crypto.randomUUID()
    });
    expect(secondManual.error).toBeNull();
    const attempt = await generationAttempt(concurrentUser);
    expect(attempt.status).toBe("feasible");
    if (attempt.status !== "feasible") return;

    const malformed = structuredClone(attempt.output);
    (
      malformed.plan.meals[0].components[0] as {
        position: number | string;
      }
    ).position = "x";
    const malformedResult = await concurrentUser.client.rpc(
      "commit_generated_week",
      {
        p_expected_version: attempt.expectedVersion,
        p_input_token: attempt.inputToken,
        p_reference_at: attempt.referenceAt,
        p_output: malformed,
        p_idempotency_key: crypto.randomUUID()
      }
    );
    expect(malformedResult.error).toBeNull();
    expect(malformedResult.data.reason).toBe("invalid_generated_output");

    const duplicatePosition = structuredClone(attempt.output);
    duplicatePosition.plan.meals[0].components[1].position =
      duplicatePosition.plan.meals[0].components[0].position;
    const duplicateResult = await concurrentUser.client.rpc(
      "commit_generated_week",
      {
        p_expected_version: attempt.expectedVersion,
        p_input_token: attempt.inputToken,
        p_reference_at: attempt.referenceAt,
        p_output: duplicatePosition,
        p_idempotency_key: crypto.randomUUID()
      }
    );
    expect(duplicateResult.error).toBeNull();
    expect(duplicateResult.data.reason).toBe("invalid_generated_output");

    const unsupportedFrozen = structuredClone(attempt.output);
    unsupportedFrozen.plan.meals[0].components[0].source = "existing_frozen";
    const frozenResult = await concurrentUser.client.rpc(
      "commit_generated_week",
      {
        p_expected_version: attempt.expectedVersion,
        p_input_token: attempt.inputToken,
        p_reference_at: attempt.referenceAt,
        p_output: unsupportedFrozen,
        p_idempotency_key: crypto.randomUUID()
      }
    );
    expect(frozenResult.error).toBeNull();
    expect(frozenResult.data.reason).toBe("invalid_generated_output");

    const tampered = structuredClone(attempt.output);
    tampered.plan.meals[0].components[0].preparationId = "not-reviewed";
    const rejected = await concurrentUser.client.rpc("commit_generated_week", {
      p_expected_version: attempt.expectedVersion,
      p_input_token: attempt.inputToken,
      p_reference_at: attempt.referenceAt,
      p_output: tampered,
      p_idempotency_key: crypto.randomUUID()
    });
    expect(rejected.error).toBeNull();
    expect(rejected.data.reason).toBe("candidate_no_longer_eligible");

    const results = await Promise.all(
      [crypto.randomUUID(), crypto.randomUUID()].map((idempotencyKey) =>
        concurrentUser.client.rpc("commit_generated_week", {
          p_expected_version: attempt.expectedVersion,
          p_input_token: attempt.inputToken,
          p_reference_at: attempt.referenceAt,
          p_output: attempt.output,
          p_idempotency_key: idempotencyKey
        })
      )
    );
    expect(results.every((result) => result.error === null)).toBe(true);
    expect(results.map((result) => result.data.status).sort()).toEqual([
      "committed",
      "rejected"
    ]);
    expect(
      results.find((result) => result.data.status === "rejected")?.data.reason
    ).toBe("planner_input_stale");
  });
});
