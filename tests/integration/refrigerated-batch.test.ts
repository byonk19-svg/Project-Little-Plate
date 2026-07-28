import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  authenticatedClient,
  type LocalSupabaseStatus,
  readLocalSupabaseStatus,
  waitForAuth
} from "./support/local-supabase";

const transactionReadyMarker = "ticket-07-transaction-ready";
const execFileAsync = promisify(execFile);

type HeldDatabaseTransaction = {
  completed: Promise<void>;
  release: () => void;
};

async function startHeldDatabaseTransaction(
  statements: string
): Promise<HeldDatabaseTransaction> {
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
  let stdout = "";
  let stderr = "";

  const completed = new Promise<void>((resolve, reject) => {
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Held database transaction exited with ${code}: ${stderr || stdout}`
          )
        );
      }
    });
  });

  const ready = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for database lock: ${stderr}`));
    }, 10_000);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.includes(transactionReadyMarker)) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  child.stdin.write(`
    begin;
    ${statements}
    select '${transactionReadyMarker}';
  `);

  await ready;
  return {
    completed,
    release: () => child.stdin.end("commit;\n")
  };
}

async function waitForBlockedServingRequest(): Promise<void> {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const { stdout } = await execFileAsync("docker", [
      "exec",
      "supabase_db_mealboard-baby",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-Atc",
      `select count(*)
         from pg_stat_activity
        where pid <> pg_backend_pid()
          and state = 'active'
          and query like '%serve_planned_portion%'
          and cardinality(pg_blocking_pids(pid)) > 0`
    ]);

    if (Number(stdout.trim()) > 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error("Timed out waiting for the serving RPC to block");
}

async function runDatabaseCommand(sql: string): Promise<void> {
  await execFileAsync("docker", [
    "exec",
    "supabase_db_mealboard-baby",
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    sql
  ]);
}

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
  let babyId: string;
  let mealComponentId: string;
  let lunchMealComponentId: string;
  let dinnerMealComponentId: string;
  let unservedMealComponentId: string;
  let unsupportedMealComponentId: string;
  let deadlineRaceComponentId: string;
  let crossBatchComponentId: string;
  let rollbackComponentId: string;
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
      p_meal_slots: ["breakfast", "lunch", "dinner"]
    });
    expect(profile.error).toBeNull();
    babyId = profile.data;

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

    const lunchPlanned = await household.rpc("plan_preparation_for_tomorrow", {
      p_baby_id: profile.data,
      p_preparation_slug: "ticket-06-preparation",
      p_meal_slot: "lunch"
    });
    expect(lunchPlanned.error).toBeNull();
    lunchMealComponentId = lunchPlanned.data.component_id;

    const dinnerPlanned = await household.rpc("plan_preparation_for_tomorrow", {
      p_baby_id: profile.data,
      p_preparation_slug: "ticket-06-preparation",
      p_meal_slot: "dinner"
    });
    expect(dinnerPlanned.error).toBeNull();
    dinnerMealComponentId = dinnerPlanned.data.component_id;

    const plan = await admin
      .from("meal_plans")
      .select("id")
      .eq("baby_id", babyId)
      .single();
    expect(plan.error).toBeNull();
    if (!plan.data) {
      throw new Error("Synthetic meal plan was not created");
    }

    const tomorrow = new Date(`${planned.data.local_date}T00:00:00Z`);
    const futureDates = Array.from({ length: 4 }, (_, index) => {
      const date = new Date(tomorrow);
      date.setUTCDate(date.getUTCDate() + index + 1);
      return date.toISOString().slice(0, 10);
    });
    const futureMeals = await admin
      .from("meals")
      .insert(
        futureDates.map((localDate) => ({
          plan_id: plan.data.id,
          local_date: localDate,
          meal_slot: "breakfast"
        }))
      )
      .select("id, local_date");
    expect(futureMeals.error).toBeNull();
    if (!futureMeals.data) {
      throw new Error("Synthetic future meals were not created");
    }
    const mealIdByDate = new Map(
      futureMeals.data.map(({ id, local_date }) => [local_date, id])
    );
    const futureComponents = await admin
      .from("meal_components")
      .insert([
        {
          meal_id: mealIdByDate.get(futureDates[0]),
          preparation_id: "prep-ticket-06-unsupported",
          revision_id: "revision-ticket-06-unsupported",
          position: 1
        },
        ...futureDates.slice(1).map((localDate) => ({
          meal_id: mealIdByDate.get(localDate),
          preparation_id: "prep-ticket-06",
          revision_id: "revision-ticket-06",
          position: 1
        }))
      ])
      .select("id, meal_id");
    expect(futureComponents.error).toBeNull();
    if (!futureComponents.data) {
      throw new Error("Synthetic future components were not created");
    }
    const componentIdForDate = (localDate: string) => {
      const mealId = mealIdByDate.get(localDate);
      const component = futureComponents.data.find(
        ({ meal_id }) => meal_id === mealId
      );
      expect(component).toBeDefined();
      return component!.id;
    };
    unsupportedMealComponentId = componentIdForDate(futureDates[0]);
    deadlineRaceComponentId = componentIdForDate(futureDates[1]);
    crossBatchComponentId = componentIdForDate(futureDates[2]);
    rollbackComponentId = componentIdForDate(futureDates[3]);
  }, 60_000);

  afterAll(async () => {
    if (userId) {
      expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
    }
    if (fixtureImported && fixtureValidated) {
      const revisionIds = [
        "revision-ticket-06",
        "revision-ticket-06-unsupported"
      ];
      const existing = await admin
        .from("content_retirements")
        .select("revision_id")
        .in("revision_id", revisionIds);
      expect(existing.error).toBeNull();
      const retiredRevisionIds = new Set(
        (existing.data ?? []).map(({ revision_id }) => revision_id)
      );
      const missing = revisionIds
        .filter((revisionId) => !retiredRevisionIds.has(revisionId))
        .map((revisionId) => ({
          revision_id: revisionId,
          retired_at: "2026-07-28",
          reason: "SYNTHETIC TEST FIXTURE CLEANUP"
        }));
      if (missing.length > 0) {
        const retired = await admin.from("content_retirements").insert(missing);
        expect(retired.error).toBeNull();
      }
    }
  });

  test("Today explains when the planned component still needs quick preparation", async () => {
    const today = await household.rpc("get_today_meal");

    expect(today.error).toBeNull();
    expect(today.data).toEqual(
      expect.objectContaining({
        status: "ready",
        meal_slot: "breakfast"
      })
    );
    expect(today.data.components[0]).toEqual(
      expect.objectContaining({
        component_id: mealComponentId,
        availability_state: "quick_preparation",
        batch_id: null,
        remaining_portions: null
      })
    );
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
    const crossHouseholdServe = await other.rpc("serve_planned_portion", {
      p_meal_component_id: mealComponentId,
      p_batch_id: createdBatchId,
      p_idempotency_key: "e651fbc8-f59b-4fe4-99f0-61c1a2f70e7b"
    });
    expect(crossHouseholdServe.error).toBeNull();
    expect(crossHouseholdServe.data).toEqual({
      status: "rejected",
      reason: "batch_unavailable"
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
  });

  test("Today serves one planned portion idempotently and arbitrates the final portion", async () => {
    const today = await household.rpc("get_today_meal");
    expect(today.error).toBeNull();
    expect(today.data).toEqual(
      expect.objectContaining({
        status: "ready",
        meal_slot: "breakfast"
      })
    );
    expect(today.data.components[0]).toEqual(
      expect.objectContaining({
        component_id: mealComponentId,
        availability_state: "ready",
        batch_id: createdBatchId,
        remaining_portions: 2
      })
    );

    const firstKey = "1c161574-5c72-4225-a772-0dcc6f04e61a";
    const served = await household.rpc("serve_planned_portion", {
      p_meal_component_id: mealComponentId,
      p_batch_id: createdBatchId,
      p_idempotency_key: firstKey
    });
    expect(served.error).toBeNull();
    expect(served.data).toEqual(
      expect.objectContaining({
        status: "served",
        remaining_portions: 1,
        idempotent_retry: false
      })
    );

    const retried = await household.rpc("serve_planned_portion", {
      p_meal_component_id: mealComponentId,
      p_batch_id: createdBatchId,
      p_idempotency_key: firstKey
    });
    expect(retried.error).toBeNull();
    expect(retried.data).toEqual({
      ...served.data,
      idempotent_retry: true
    });

    const newKeyRetry = await household.rpc("serve_planned_portion", {
      p_meal_component_id: mealComponentId,
      p_batch_id: createdBatchId,
      p_idempotency_key: "f5596c49-ed71-4f8f-a7f5-34264d0278ac"
    });
    expect(newKeyRetry.error).toBeNull();
    expect(newKeyRetry.data).toEqual({
      status: "rejected",
      reason: "component_already_served"
    });

    const nextMeal = await household.rpc("get_today_meal");
    expect(nextMeal.error).toBeNull();
    expect(nextMeal.data).toEqual(
      expect.objectContaining({
        status: "ready",
        meal_slot: "lunch"
      })
    );
    expect(nextMeal.data.components[0]).toEqual(
      expect.objectContaining({
        component_id: lunchMealComponentId,
        availability_state: "ready",
        batch_id: createdBatchId,
        remaining_portions: 1
      })
    );

    const [firstFinalAttempt, secondFinalAttempt] = await Promise.all([
      household.rpc("serve_planned_portion", {
        p_meal_component_id: dinnerMealComponentId,
        p_batch_id: createdBatchId,
        p_idempotency_key: "a18838f1-5105-48e9-bad4-532d63a145c8"
      }),
      household.rpc("serve_planned_portion", {
        p_meal_component_id: lunchMealComponentId,
        p_batch_id: createdBatchId,
        p_idempotency_key: "e2ef916c-0402-45bf-8147-b14ac20f5038"
      })
    ]);
    expect(firstFinalAttempt.error).toBeNull();
    expect(secondFinalAttempt.error).toBeNull();
    const outcomes = [firstFinalAttempt.data, secondFinalAttempt.data];
    expect(outcomes.filter(({ status }) => status === "served")).toHaveLength(
      1
    );
    expect(
      outcomes.filter(
        ({ status, reason }) =>
          status === "rejected" && reason === "batch_depleted"
      )
    ).toHaveLength(1);
    unservedMealComponentId =
      firstFinalAttempt.data.status === "served"
        ? lunchMealComponentId
        : dinnerMealComponentId;

    const events = await household
      .from("batch_events")
      .select("id, event_type, portion_delta, idempotency_key")
      .eq("batch_id", createdBatchId)
      .eq("event_type", "served");
    expect(events.error).toBeNull();
    expect(events.data).toHaveLength(2);
    expect(
      events.data?.every(({ portion_delta }) => portion_delta === -1)
    ).toBe(true);

    const kitchen = await household.rpc("get_kitchen_inventory", {
      p_reference_at: new Date().toISOString()
    });
    expect(kitchen.error).toBeNull();
    expect(kitchen.data.items[0]).toEqual(
      expect.objectContaining({
        batch_id: createdBatchId,
        remaining_portions: 0,
        storage_status: "depleted",
        projection_matches_ledger: true
      })
    );

    const week = await household.rpc("get_current_week");
    expect(week.error).toBeNull();
    const components = week.data.days.flatMap(
      (day: {
        slots: Array<{
          components: Array<{
            component_id: string;
            serving_status: string;
          }>;
        }>;
      }) => day.slots.flatMap((slot) => slot.components)
    );
    expect(
      components.find(
        (component: { component_id: string }) =>
          component.component_id === mealComponentId
      )
    ).toEqual(expect.objectContaining({ serving_status: "served" }));
  });

  test("the same planned component can be served from only one of two batches", async () => {
    const preparedAt = new Date(Date.now() - 60_000).toISOString();
    const [firstBatch, secondBatch] = await Promise.all([
      household.rpc("create_refrigerated_batch", {
        p_meal_component_id: crossBatchComponentId,
        p_prepared_or_opened_at: preparedAt,
        p_portion_count: 1,
        p_idempotency_key: "20fa52b7-33ec-4c85-8fd0-264d776b7a41",
        p_storage_location: "refrigerator"
      }),
      household.rpc("create_refrigerated_batch", {
        p_meal_component_id: crossBatchComponentId,
        p_prepared_or_opened_at: preparedAt,
        p_portion_count: 1,
        p_idempotency_key: "c466c39b-3dae-447d-a131-0e48dbafbf3e",
        p_storage_location: "refrigerator"
      })
    ]);
    expect(firstBatch.error).toBeNull();
    expect(secondBatch.error).toBeNull();

    const attempts = await Promise.all([
      household.rpc("serve_planned_portion", {
        p_meal_component_id: crossBatchComponentId,
        p_batch_id: firstBatch.data.batch_id,
        p_idempotency_key: "94a74b27-02b7-4e22-9697-f1be32656688"
      }),
      household.rpc("serve_planned_portion", {
        p_meal_component_id: crossBatchComponentId,
        p_batch_id: secondBatch.data.batch_id,
        p_idempotency_key: "c6b98d22-2615-43fd-a876-7d41b2d67be9"
      })
    ]);

    expect(attempts.every(({ error }) => error === null)).toBe(true);
    expect(
      attempts.filter(({ data }) => data.status === "served")
    ).toHaveLength(1);
    expect(
      attempts.filter(
        ({ data }) =>
          data.status === "rejected" &&
          data.reason === "component_already_served"
      )
    ).toHaveLength(1);
  });

  test("a request that waits past the reviewed deadline is rejected using post-lock database time", async () => {
    const preparedAt = new Date(
      Date.now() - 24 * 60 * 60 * 1000 + 3_000
    ).toISOString();
    const created = await household.rpc("create_refrigerated_batch", {
      p_meal_component_id: deadlineRaceComponentId,
      p_prepared_or_opened_at: preparedAt,
      p_portion_count: 1,
      p_idempotency_key: "1796aa86-5ec4-46fc-8697-13fa81520d11",
      p_storage_location: "refrigerator"
    });
    expect(created.error).toBeNull();

    const held = await startHeldDatabaseTransaction(`
      select id
      from public.batches
      where id = '${created.data.batch_id}'
      for update;
    `);
    const request = household
      .rpc("serve_planned_portion", {
        p_meal_component_id: deadlineRaceComponentId,
        p_batch_id: created.data.batch_id,
        p_idempotency_key: "164b9864-ab2d-492b-b535-1154d96e22b8"
      })
      .then((result) => result);
    await waitForBlockedServingRequest();
    const waitMilliseconds = Math.max(
      0,
      new Date(created.data.deadline_at).getTime() - Date.now() + 100
    );
    await new Promise((resolve) => setTimeout(resolve, waitMilliseconds));
    held.release();
    const [result] = await Promise.all([request, held.completed]);

    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      status: "rejected",
      reason: "batch_expired"
    });
    const events = await household
      .from("batch_events")
      .select("id")
      .eq("batch_id", created.data.batch_id)
      .eq("event_type", "served");
    expect(events.error).toBeNull();
    expect(events.data).toEqual([]);
  });

  test("a storage failure after event insertion rolls back the serving event", async () => {
    const created = await household.rpc("create_refrigerated_batch", {
      p_meal_component_id: rollbackComponentId,
      p_prepared_or_opened_at: new Date(Date.now() - 60_000).toISOString(),
      p_portion_count: 1,
      p_idempotency_key: "36057e40-f8d8-4401-bd88-81c8ff97ef71",
      p_storage_location: "refrigerator"
    });
    expect(created.error).toBeNull();
    const safeBatchId = created.data.batch_id.replaceAll("'", "''");

    await runDatabaseCommand(`
      create or replace function public.ticket_07_fail_projection_update()
      returns trigger
      language plpgsql
      set search_path = ''
      as $$
      begin
        if new.id = '${safeBatchId}'::uuid then
          raise exception 'synthetic projection failure';
        end if;
        return new;
      end;
      $$;
      create trigger ticket_07_fail_projection_update
      before update on public.batches
      for each row execute function
        public.ticket_07_fail_projection_update();
    `);

    try {
      const failed = await household.rpc("serve_planned_portion", {
        p_meal_component_id: rollbackComponentId,
        p_batch_id: created.data.batch_id,
        p_idempotency_key: "803d8e91-df9b-4a1d-b79b-83a38ad62f72"
      });
      expect(failed.error).not.toBeNull();

      const events = await household
        .from("batch_events")
        .select("id")
        .eq("batch_id", created.data.batch_id)
        .eq("event_type", "served");
      expect(events.error).toBeNull();
      expect(events.data).toEqual([]);
      const batch = await household
        .from("batches")
        .select("remaining_portions")
        .eq("id", created.data.batch_id)
        .single();
      expect(batch.error).toBeNull();
      if (!batch.data) {
        throw new Error("Synthetic rollback batch was not readable");
      }
      expect(batch.data.remaining_portions).toBe(1);
    } finally {
      await runDatabaseCommand(`
        drop trigger if exists ticket_07_fail_projection_update
          on public.batches;
        drop function if exists
          public.ticket_07_fail_projection_update();
      `);
    }
  });

  test("serving fails closed for stale, blocked, expired, cross-household, and unpublished attempts", async () => {
    const recentBatch = await household.rpc("create_refrigerated_batch", {
      p_meal_component_id: unservedMealComponentId,
      p_prepared_or_opened_at: new Date(Date.now() - 60_000).toISOString(),
      p_portion_count: 2,
      p_idempotency_key: "f9dd9ad0-fde5-49c0-b885-389d23973418",
      p_storage_location: "refrigerator"
    });
    expect(recentBatch.error).toBeNull();

    const restrictionTransaction = await startHeldDatabaseTransaction(`
      select id
      from public.babies
      where id = '${babyId}'
      for update;

      update public.baby_food_restrictions
      set status = 'temporary_avoidance'
      where baby_id = '${babyId}'
        and food_id = 'food-ticket-06';
    `);
    const blockedRequest = household
      .rpc("serve_planned_portion", {
        p_meal_component_id: unservedMealComponentId,
        p_batch_id: recentBatch.data.batch_id,
        p_idempotency_key: "cf18c1cb-525c-4d39-b1e6-3cef236e99b2"
      })
      .then((result) => result);
    await waitForBlockedServingRequest();
    restrictionTransaction.release();
    const [blockedServe] = await Promise.all([
      blockedRequest,
      restrictionTransaction.completed
    ]);
    expect(blockedServe.error).toBeNull();
    expect(blockedServe.data).toEqual({
      status: "rejected",
      reason: "food_restricted"
    });

    const restored = await admin
      .from("baby_food_restrictions")
      .update({ status: "no_known_restriction" })
      .eq("baby_id", babyId)
      .eq("food_id", "food-ticket-06");
    expect(restored.error).toBeNull();

    const expiredBatch = await household.rpc("create_refrigerated_batch", {
      p_meal_component_id: unservedMealComponentId,
      p_prepared_or_opened_at: new Date(
        Date.now() - 48 * 60 * 60 * 1000
      ).toISOString(),
      p_portion_count: 1,
      p_idempotency_key: "8632c178-1352-4cb7-acf8-bda246c1a80f",
      p_storage_location: "refrigerator"
    });
    expect(expiredBatch.error).toBeNull();
    const expiredServe = await household.rpc("serve_planned_portion", {
      p_meal_component_id: unservedMealComponentId,
      p_batch_id: expiredBatch.data.batch_id,
      p_idempotency_key: "1cbd7799-d21e-49b0-8332-4a0c3bd8edb5"
    });
    expect(expiredServe.data).toEqual({
      status: "rejected",
      reason: "batch_expired"
    });

    const anonymous = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    expect(
      (
        await anonymous.rpc("serve_planned_portion", {
          p_meal_component_id: unservedMealComponentId,
          p_batch_id: recentBatch.data.batch_id,
          p_idempotency_key: "81fe0d80-8d28-47f5-945e-93b228655b94"
        })
      ).error
    ).not.toBeNull();

    expect(
      (
        await household.from("batch_events").insert({
          batch_id: recentBatch.data.batch_id,
          event_type: "served",
          occurred_at: new Date().toISOString(),
          actor_user_id: userId,
          portion_delta: -1,
          meal_component_id: unservedMealComponentId,
          idempotency_key: "9ce817b3-e900-469c-b232-551fe6fb84b8"
        })
      ).error
    ).not.toBeNull();

    const retirementTransaction = await startHeldDatabaseTransaction(`
      insert into public.content_retirements (
        revision_id,
        retired_at,
        reason
      ) values (
        'revision-ticket-06',
        '2026-07-28',
        'SYNTHETIC TICKET 07 UNPUBLISHED CHECK'
      );
    `);
    const unpublishedRequest = household
      .rpc("serve_planned_portion", {
        p_meal_component_id: unservedMealComponentId,
        p_batch_id: recentBatch.data.batch_id,
        p_idempotency_key: "d3f74fe3-3d99-44a7-8095-4bf061239a6b"
      })
      .then((result) => result);
    await waitForBlockedServingRequest();
    retirementTransaction.release();
    const [unpublishedServe] = await Promise.all([
      unpublishedRequest,
      retirementTransaction.completed
    ]);
    expect(unpublishedServe.error).toBeNull();
    expect(unpublishedServe.data).toEqual({
      status: "rejected",
      reason: "preparation_not_approved"
    });

    const unchanged = await household.rpc("get_kitchen_inventory", {
      p_reference_at: new Date().toISOString()
    });
    expect(
      unchanged.data.items.find(
        (item: { batch_id: string }) =>
          item.batch_id === recentBatch.data.batch_id
      )
    ).toEqual(expect.objectContaining({ remaining_portions: 2 }));
    fixtureValidated = true;
  });
});
