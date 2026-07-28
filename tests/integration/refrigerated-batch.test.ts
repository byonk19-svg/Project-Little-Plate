import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  authenticatedClient,
  type LocalSupabaseStatus,
  readLocalSupabaseStatus,
  waitForAuth
} from "./support/local-supabase";

function ticketSixFixture() {
  return {
    sources: [
      {
        id: "source-ticket-06",
        publisher: "Synthetic Ticket 06 publisher",
        title: "Synthetic Ticket 06 source",
        url: "https://example.test/ticket-06",
        source_date: "2026-01-01",
        accessed_at: "2026-07-28"
      }
    ],
    tags: [
      {
        id: "skill-ticket-06",
        kind: "skill",
        label: "Synthetic Ticket 06 observed ability"
      },
      {
        id: "allergen-ticket-06",
        kind: "allergen",
        label: "Synthetic Ticket 06 allergen marker"
      }
    ],
    foods: [
      {
        id: "food-ticket-06",
        slug: "ticket-06-food",
        name: "Ticket 06 Food",
        category: "synthetic-test-fixture"
      },
      {
        id: "food-ticket-06-unsupported",
        slug: "ticket-06-unsupported-food",
        name: "Ticket 06 Unsupported Food",
        category: "synthetic-test-fixture"
      }
    ],
    preparations: [
      {
        id: "prep-ticket-06",
        food_id: "food-ticket-06",
        slug: "ticket-06-preparation",
        name: "Ticket 06 Preparation",
        is_active: true
      },
      {
        id: "prep-ticket-06-unsupported",
        food_id: "food-ticket-06-unsupported",
        slug: "ticket-06-unsupported-preparation",
        name: "Ticket 06 Unsupported Preparation",
        is_active: true
      }
    ],
    revisions: [
      {
        id: "revision-ticket-06",
        preparation_id: "prep-ticket-06",
        version: 1,
        status: "approved",
        method: "SYNTHETIC TEST METHOD",
        shape_texture: "SYNTHETIC TEST TEXTURE",
        source_id: "source-ticket-06",
        reviewer_role: "synthetic_test_reviewer",
        reviewed_at: "2026-07-28",
        approved_at: "2026-07-28",
        next_review_at: "2027-07-28",
        tag_ids: ["skill-ticket-06", "allergen-ticket-06"],
        storage_rules: [
          {
            id: "rule-ticket-06",
            support_status: "supported",
            deadline_kind: "discard_after",
            duration_hours: 24,
            guidance: "SYNTHETIC REVIEWED TEST STORAGE GUIDANCE"
          }
        ]
      },
      {
        id: "revision-ticket-06-unsupported",
        preparation_id: "prep-ticket-06-unsupported",
        version: 1,
        status: "approved",
        method: "SYNTHETIC TEST METHOD",
        shape_texture: "SYNTHETIC TEST TEXTURE",
        source_id: "source-ticket-06",
        reviewer_role: "synthetic_test_reviewer",
        reviewed_at: "2026-07-28",
        approved_at: "2026-07-28",
        next_review_at: "2027-07-28",
        tag_ids: ["skill-ticket-06", "allergen-ticket-06"],
        storage_rules: [
          {
            id: "rule-ticket-06-unsupported",
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

describe("refrigerated batch creation", () => {
  let status: LocalSupabaseStatus;
  let admin: SupabaseClient;
  let household: SupabaseClient;
  let userId: string | null = null;
  let mealComponentId: string;
  let unsupportedMealComponentId: string;
  let createdBatchId: string;
  let storedDeadline: string;
  let fixtureImported = false;
  let fixtureValidated = false;

  beforeAll(async () => {
    status = readLocalSupabaseStatus();
    await waitForAuth(status);
    admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const imported = await admin.rpc("import_catalog_fixture", {
      p_fixture: ticketSixFixture()
    });
    expect(imported.error).toBeNull();

    const profileImported = await admin.rpc("import_storage_rule_profiles", {
      p_profiles: [
        {
          id: "rule-profile-ticket-06-v1",
          storage_rule_id: "rule-ticket-06",
          content_revision_id: "revision-ticket-06",
          storage_location: "refrigerator",
          start_event_kind: "prepared_or_opened",
          precedence: 0,
          duration_min_hours: 24,
          duration_max_hours: 48,
          source_id: "source-ticket-06",
          reviewer_role: "synthetic_test_reviewer",
          reviewed_at: "2026-07-28",
          approved_at: "2026-07-28",
          next_review_at: "2027-07-28"
        }
      ]
    });
    expect(profileImported.error).toBeNull();
    fixtureImported = true;

    const email = `ticket-06-${crypto.randomUUID()}@example.test`;
    const password = `Ticket-06-${crypto.randomUUID()}`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    expect(created.error).toBeNull();
    userId = created.data.user!.id;

    const authClient = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const signedIn = await authClient.auth.signInWithPassword({
      email,
      password
    });
    expect(signedIn.error).toBeNull();
    household = authenticatedClient(
      status,
      signedIn.data.session!.access_token
    );

    expect((await household.rpc("bootstrap_account")).error).toBeNull();
    const profile = await household.rpc("complete_baby_profile", {
      p_nickname: "Juniper",
      p_birth_date: "2025-10-15",
      p_time_zone: "America/Chicago",
      p_feeding_style: "mixed",
      p_meal_slots: ["breakfast"]
    });
    expect(profile.error).toBeNull();

    const configured = await household.rpc("save_feeding_configuration", {
      p_skill_statuses: [{ skill_id: "skill-ticket-06", status: "observed" }],
      p_restrictions: [
        {
          food_id: "food-ticket-06",
          status: "no_known_restriction"
        },
        {
          food_id: "food-ticket-06-unsupported",
          status: "no_known_restriction"
        }
      ],
      p_exposures: [],
      p_new_food_pace: "one_per_week",
      p_preparation_time: "under_30_minutes",
      p_prep_day: null,
      p_quick_backup_food_ids: []
    });
    expect(configured.error).toBeNull();

    const planned = await household.rpc("plan_preparation_for_tomorrow", {
      p_baby_id: profile.data,
      p_preparation_slug: "ticket-06-preparation",
      p_meal_slot: "breakfast"
    });
    expect(planned.error).toBeNull();
    mealComponentId = planned.data.component_id;

    const unsupportedPlanned = await household.rpc(
      "plan_preparation_for_tomorrow",
      {
        p_baby_id: profile.data,
        p_preparation_slug: "ticket-06-unsupported-preparation",
        p_meal_slot: "breakfast"
      }
    );
    expect(unsupportedPlanned.error).toBeNull();
    unsupportedMealComponentId = unsupportedPlanned.data.component_id;
  }, 60_000);

  afterAll(async () => {
    if (userId) {
      expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
    }
    if (fixtureImported && fixtureValidated) {
      const retired = await admin.from("content_retirements").insert([
        {
          revision_id: "revision-ticket-06",
          retired_at: "2026-07-28",
          reason: "SYNTHETIC TEST FIXTURE CLEANUP"
        },
        {
          revision_id: "revision-ticket-06-unsupported",
          retired_at: "2026-07-28",
          reason: "SYNTHETIC TEST FIXTURE CLEANUP"
        }
      ]);
      expect(retired.error).toBeNull();
    }
  });

  test("a planned preparation previews and creates two refrigerated portions with an explained deadline", async () => {
    const preparedAt = "2026-07-28T12:00:00.000Z";
    const referenceAt = "2026-07-28T13:00:00.000Z";
    const preview = await household.rpc("preview_refrigerated_batch", {
      p_meal_component_id: mealComponentId,
      p_prepared_or_opened_at: preparedAt,
      p_storage_location: "refrigerator",
      p_reference_at: referenceAt
    });

    expect(preview.error).toBeNull();
    expect(preview.data).toEqual({
      status: "ready",
      preparation_name: "Ticket 06 Preparation",
      storage_location: "refrigerator",
      rule_profile_id: "rule-profile-ticket-06-v1",
      storage_rule_id: "rule-ticket-06",
      content_revision_id: "revision-ticket-06",
      reviewed_duration_range_hours: {
        minimum: 24,
        maximum: 48
      },
      applied_duration_hours: 24,
      guidance: "SYNTHETIC REVIEWED TEST STORAGE GUIDANCE",
      reviewed_at: "2026-07-28",
      source_title: "Synthetic Ticket 06 source",
      source_url: "https://example.test/ticket-06",
      prepared_or_opened_at: "2026-07-28T12:00:00+00:00",
      deadline_at: "2026-07-29T12:00:00+00:00"
    });

    const created = await household.rpc("create_refrigerated_batch", {
      p_meal_component_id: mealComponentId,
      p_prepared_or_opened_at: preparedAt,
      p_portion_count: 2,
      p_idempotency_key: "41fe4570-2399-46df-a6d0-aad437fde572",
      p_storage_location: "refrigerator"
    });
    expect(created.error).toBeNull();
    expect(created.data).toEqual(
      expect.objectContaining({
        status: "created",
        remaining_portions: 2,
        deadline_at: "2026-07-29T12:00:00+00:00"
      })
    );
    createdBatchId = created.data.batch_id;
    storedDeadline = created.data.deadline_at;

    const kitchen = await household.rpc("get_kitchen_inventory", {
      p_reference_at: referenceAt
    });
    expect(kitchen.error).toBeNull();
    expect(kitchen.data.items).toEqual([
      expect.objectContaining({
        preparation_name: "Ticket 06 Preparation",
        remaining_portions: 2,
        prepared_or_opened_at: "2026-07-28T12:00:00+00:00",
        deadline_at: "2026-07-29T12:00:00+00:00",
        storage_status: "use_today",
        projection_matches_ledger: true
      })
    ]);
  });

  test("unsupported reviewed storage and invalid rule profiles fail without creating a batch", async () => {
    const future = await household.rpc("create_refrigerated_batch", {
      p_meal_component_id: mealComponentId,
      p_prepared_or_opened_at: "2100-01-01T00:00:00.000Z",
      p_portion_count: 2,
      p_idempotency_key: "cb153fd1-d850-45c0-8268-76fdc7585868",
      p_storage_location: "refrigerator"
    });
    expect(future.error).toBeNull();
    expect(future.data).toEqual({
      status: "rejected",
      reason: "invalid_prepared_time"
    });

    const nullClockInventory = await household.rpc("get_kitchen_inventory", {
      p_reference_at: null
    });
    expect(nullClockInventory.error).toBeNull();
    expect(nullClockInventory.data.items[0].storage_status).not.toBe("ready");

    const unsupported = await household.rpc("preview_refrigerated_batch", {
      p_meal_component_id: unsupportedMealComponentId,
      p_prepared_or_opened_at: "2026-07-28T12:00:00.000Z",
      p_storage_location: "refrigerator",
      p_reference_at: "2026-07-28T13:00:00.000Z"
    });
    expect(unsupported.error).toBeNull();
    expect(unsupported.data).toEqual({
      status: "unsupported",
      reason: "storage_rule_unavailable"
    });

    const invalidProfile = await admin.rpc("import_storage_rule_profiles", {
      p_profiles: [
        {
          id: "rule-profile-ticket-06-invalid",
          storage_rule_id: "rule-ticket-06",
          content_revision_id: "revision-ticket-06",
          storage_location: "refrigerator",
          start_event_kind: "prepared_or_opened",
          precedence: 1,
          duration_min_hours: 12,
          duration_max_hours: 48,
          source_id: "source-ticket-06",
          reviewer_role: "synthetic_test_reviewer",
          reviewed_at: "2026-07-28",
          approved_at: "2026-07-28",
          next_review_at: "2027-07-28"
        }
      ]
    });
    expect(invalidProfile.error?.message).toContain(
      "must reference a supported approved discard rule"
    );
  });

  test("retries are idempotent and reads or meal edits never extend the stored deadline", async () => {
    const retried = await household.rpc("create_refrigerated_batch", {
      p_meal_component_id: mealComponentId,
      p_prepared_or_opened_at: "2026-07-28T12:00:00.000Z",
      p_portion_count: 2,
      p_idempotency_key: "41fe4570-2399-46df-a6d0-aad437fde572",
      p_storage_location: "refrigerator"
    });
    expect(retried.error).toBeNull();
    expect(retried.data).toEqual(
      expect.objectContaining({
        status: "created",
        batch_id: createdBatchId,
        remaining_portions: 2,
        deadline_at: storedDeadline,
        idempotent_retry: true
      })
    );

    expect(
      (
        await household.rpc("plan_preparation_for_tomorrow", {
          p_baby_id: (
            await household.rpc("get_kitchen_inventory", {
              p_reference_at: "2026-07-28T14:00:00.000Z"
            })
          ).data.baby_id,
          p_preparation_slug: "ticket-06-preparation",
          p_meal_slot: "breakfast"
        })
      ).error
    ).toBeNull();

    const laterRead = await household.rpc("get_kitchen_inventory", {
      p_reference_at: "2026-07-29T13:00:00.000Z"
    });
    expect(laterRead.error).toBeNull();
    expect(laterRead.data.items[0]).toEqual(
      expect.objectContaining({
        deadline_at: storedDeadline,
        storage_status: "expired"
      })
    );

    const attemptedExtension = await admin
      .from("batch_deadlines")
      .update({ deadline_at: "2026-07-30T12:00:00.000Z" })
      .eq("batch_id", createdBatchId);
    expect(attemptedExtension.error?.message).toContain(
      "Batch events and deadlines are append-only"
    );
  });

  test("the event ledger detects and reconciles a stale cached portion projection", async () => {
    const corrupted = await admin
      .from("batches")
      .update({ remaining_portions: 1 })
      .eq("id", createdBatchId);
    expect(corrupted.error).toBeNull();

    const stale = await household.rpc("get_kitchen_inventory", {
      p_reference_at: "2026-07-28T14:00:00.000Z"
    });
    expect(stale.data.items[0]).toEqual(
      expect.objectContaining({
        remaining_portions: 2,
        projection_matches_ledger: false
      })
    );

    const staleHighUpdate = await admin
      .from("batches")
      .update({ remaining_portions: 99 })
      .eq("id", createdBatchId);
    expect(staleHighUpdate.error).toBeNull();
    const staleHigh = await household.rpc("get_kitchen_inventory", {
      p_reference_at: "2026-07-28T14:00:00.000Z"
    });
    expect(staleHigh.data.items[0]).toEqual(
      expect.objectContaining({
        remaining_portions: 2,
        projection_matches_ledger: false
      })
    );

    const reconciled = await household.rpc("reconcile_batch_projection", {
      p_batch_id: createdBatchId
    });
    expect(reconciled.error).toBeNull();
    expect(reconciled.data).toEqual({
      status: "reconciled",
      batch_id: createdBatchId,
      remaining_portions: 2
    });

    const ready = await household.rpc("get_kitchen_inventory", {
      p_reference_at: "2026-07-28T14:00:00.000Z"
    });
    expect(ready.data.items[0]).toEqual(
      expect.objectContaining({
        remaining_portions: 2,
        projection_matches_ledger: true
      })
    );
  });

  test("cross-household callers and direct writes cannot access batch state", async () => {
    const email = `ticket-06-other-${crypto.randomUUID()}@example.test`;
    const password = `Ticket-06-${crypto.randomUUID()}`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    expect(created.error).toBeNull();

    const authClient = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const signedIn = await authClient.auth.signInWithPassword({
      email,
      password
    });
    expect(signedIn.error).toBeNull();
    const other = authenticatedClient(
      status,
      signedIn.data.session!.access_token
    );
    expect((await other.rpc("bootstrap_account")).error).toBeNull();
    expect(
      (
        await other.rpc("complete_baby_profile", {
          p_nickname: "Other baby",
          p_birth_date: "2025-10-15",
          p_time_zone: "America/New_York",
          p_feeding_style: "mixed",
          p_meal_slots: ["breakfast"]
        })
      ).error
    ).toBeNull();

    const crossHousehold = await other.rpc("preview_refrigerated_batch", {
      p_meal_component_id: mealComponentId,
      p_prepared_or_opened_at: "2026-07-28T12:00:00.000Z",
      p_storage_location: "refrigerator",
      p_reference_at: "2026-07-28T13:00:00.000Z"
    });
    expect(crossHousehold.error).toBeNull();
    expect(crossHousehold.data).toEqual({
      status: "unsupported",
      reason: "planned_component_unavailable"
    });

    expect((await other.from("batches").select("*")).data).toEqual([]);
    expect(
      (
        await household.from("batch_events").insert({
          batch_id: createdBatchId,
          event_type: "prepared_or_opened",
          occurred_at: "2026-07-28T12:00:00.000Z",
          actor_user_id: userId,
          portion_delta: 2
        })
      ).error
    ).not.toBeNull();

    expect(
      (await admin.auth.admin.deleteUser(created.data.user!.id)).error
    ).toBeNull();
    fixtureValidated = true;
  });
});
