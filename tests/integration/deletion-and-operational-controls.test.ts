import { execFileSync, spawn } from "node:child_process";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  authenticatedClient,
  type LocalSupabaseStatus,
  readLocalSupabaseStatus,
  waitForAuth
} from "./support/local-supabase";
import { buildPlannerGenerationAttempt } from "../../src/modules/planner/generation";

type TestUser = {
  id: string;
  client: SupabaseClient;
};

function runPsql(sql: string) {
  return execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_mealboard-baby",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-Atc",
      sql
    ],
    { encoding: "utf8" }
  ).trim();
}

async function holdDatabaseRow(
  table: "babies" | "batches" | "meal_plans",
  id: string
): Promise<() => Promise<void>> {
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
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const exited = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Baby lock exited with ${code}: ${stderr}`));
    });
  });
  const ready = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out acquiring baby lock: ${stderr}`)),
      10_000
    );
    child.stdout.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("ticket-16-row-lock")) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  child.stdin.write(`
    begin;
    select id from public.${table} where id = '${id}' for update;
    select 'ticket-16-row-lock';
  `);
  try {
    await ready;
  } catch (error) {
    child.kill();
    await exited.catch(() => undefined);
    throw error;
  }
  let released = false;
  return async () => {
    if (!released) {
      released = true;
      child.stdin.end("commit;\n");
    }
    await exited;
  };
}

async function waitForBlockedRequests(expectedCount: number) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const blocked = Number(
      runPsql(
        "select count(*) from pg_stat_activity where pid <> pg_backend_pid() and state = 'active' and cardinality(pg_blocking_pids(pid)) > 0"
      )
    );
    if (blocked >= expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `Timed out waiting for ${expectedCount} database requests to block`
  );
}

async function holdDatabaseTable(table: "content_revisions" | "storage_rules") {
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
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const exited = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Table lock exited with ${code}: ${stderr}`));
    });
  });
  const ready = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out acquiring table lock: ${stderr}`)),
      10_000
    );
    child.stdout.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("ticket-16-table-lock")) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  child.stdin.write(`
    begin;
    lock table public.${table} in access exclusive mode;
    select 'ticket-16-table-lock';
  `);
  try {
    await ready;
  } catch (error) {
    child.kill();
    await exited.catch(() => undefined);
    throw error;
  }
  let released = false;
  return async () => {
    if (!released) {
      released = true;
      child.stdin.end("commit;\n");
    }
    await exited;
  };
}

async function waitForBlockedGenerationCommit() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const blocked = Number(
      execFileSync(
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
          "select count(*) from pg_stat_activity where pid <> pg_backend_pid() and state = 'active' and cardinality(pg_blocking_pids(pid)) > 0"
        ],
        { encoding: "utf8" }
      ).trim()
    );
    if (blocked > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for generation commit to block");
}

const fixtureId = crypto.randomUUID();
const contentFixture = {
  sources: [
    {
      id: `source-ticket-16-${fixtureId}`,
      publisher: "Synthetic operational publisher",
      title: "Synthetic operational source",
      url: "https://example.test/ticket-16",
      source_date: "2026-01-01",
      accessed_at: "2026-07-29"
    }
  ],
  tags: [
    {
      id: `skill-ticket-16-${fixtureId}`,
      kind: "skill",
      label: "Synthetic operational skill"
    },
    {
      id: `allergen-ticket-16-${fixtureId}`,
      kind: "allergen",
      label: "Synthetic operational allergen"
    }
  ],
  foods: [
    {
      id: `food-ticket-16-${fixtureId}`,
      slug: `ticket-16-food-${fixtureId}`,
      name: "Ticket 16 synthetic food",
      category: "synthetic-test-fixture"
    }
  ],
  preparations: [
    {
      id: `preparation-ticket-16-${fixtureId}`,
      food_id: `food-ticket-16-${fixtureId}`,
      slug: `ticket-16-preparation-${fixtureId}`,
      name: "Ticket 16 synthetic preparation",
      is_active: true
    }
  ],
  revisions: [
    {
      id: `revision-ticket-16-${fixtureId}`,
      preparation_id: `preparation-ticket-16-${fixtureId}`,
      version: 1,
      status: "approved",
      method: "SYNTHETIC OPERATIONAL METHOD",
      shape_texture: "SYNTHETIC OPERATIONAL TEXTURE",
      source_id: `source-ticket-16-${fixtureId}`,
      reviewer_role: "synthetic_operational_reviewer",
      reviewed_at: "2026-07-29",
      approved_at: "2026-07-29",
      next_review_at: "2027-07-29",
      tag_ids: [
        `skill-ticket-16-${fixtureId}`,
        `allergen-ticket-16-${fixtureId}`
      ],
      storage_rules: [
        {
          id: `rule-ticket-16-${fixtureId}`,
          support_status: "supported",
          deadline_kind: "discard_after",
          duration_hours: 168,
          guidance: "SYNTHETIC REVIEWED OPERATIONAL STORAGE GUIDANCE"
        }
      ]
    }
  ],
  retirements: []
};

describe("deletion and operational controls", () => {
  let status: LocalSupabaseStatus;
  let admin: SupabaseClient;
  const remainingUserIds = new Set<string>();

  async function createUser(label: string): Promise<TestUser> {
    const email = `ticket-16-${label}-${crypto.randomUUID()}@example.test`;
    const password = `Ticket-16-${crypto.randomUUID()}`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    expect(created.error).toBeNull();
    remainingUserIds.add(created.data.user!.id);

    const authClient = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const signedIn = await authClient.auth.signInWithPassword({
      email,
      password
    });
    expect(signedIn.error).toBeNull();
    const client = authenticatedClient(
      status,
      signedIn.data.session!.access_token
    );
    expect((await client.rpc("bootstrap_account")).error).toBeNull();
    expect(
      (
        await client.rpc("complete_baby_profile", {
          p_nickname: "Deletion fixture",
          p_birth_date: "2025-10-15",
          p_time_zone: "America/Chicago",
          p_feeding_style: "mixed",
          p_meal_slots: ["breakfast", "lunch"]
        })
      ).error
    ).toBeNull();
    return { id: created.data.user!.id, client };
  }

  async function seedPlanAndInventory(user: TestUser) {
    const baby = await user.client.from("babies").select("id").single();
    expect(baby.error).toBeNull();
    const plan = await admin
      .from("meal_plans")
      .insert({ baby_id: baby.data!.id })
      .select("id")
      .single();
    expect(plan.error).toBeNull();
    const meal = await admin
      .from("meals")
      .insert({
        plan_id: plan.data!.id,
        local_date: "2026-07-30",
        meal_slot: "breakfast"
      })
      .select("id")
      .single();
    expect(meal.error).toBeNull();
    expect(
      (
        await admin.from("meal_components").insert({
          meal_id: meal.data!.id,
          preparation_id: `preparation-ticket-16-${fixtureId}`,
          revision_id: `revision-ticket-16-${fixtureId}`,
          position: 1
        })
      ).error
    ).toBeNull();

    const preparedAt = "2026-07-29T12:00:00.000Z";
    const batch = await admin
      .from("batches")
      .insert({
        baby_id: baby.data!.id,
        preparation_id: `preparation-ticket-16-${fixtureId}`,
        content_revision_id: `revision-ticket-16-${fixtureId}`,
        storage_location: "refrigerator",
        prepared_or_opened_at: preparedAt,
        initial_portions: 2,
        remaining_portions: 2,
        idempotency_key: crypto.randomUUID()
      })
      .select("id")
      .single();
    expect(batch.error).toBeNull();
    const event = await admin
      .from("batch_events")
      .insert({
        batch_id: batch.data!.id,
        event_type: "prepared_or_opened",
        occurred_at: preparedAt,
        actor_user_id: user.id,
        portion_delta: 2
      })
      .select("id")
      .single();
    expect(event.error).toBeNull();
    const deadline = await admin
      .from("batch_deadlines")
      .insert({
        batch_id: batch.data!.id,
        start_event_id: event.data!.id,
        rule_profile_id: `profile-ticket-16-${fixtureId}`,
        storage_rule_id: `rule-ticket-16-${fixtureId}`,
        content_revision_id: `revision-ticket-16-${fixtureId}`,
        deadline_kind: "discard_after",
        applied_duration_hours: 168,
        reviewed_duration_min_hours: 168,
        reviewed_duration_max_hours: 168,
        deadline_at: "2026-08-05T12:00:00.000Z"
      })
      .select("id")
      .single();
    expect(deadline.error).toBeNull();
    return {
      babyId: baby.data!.id,
      planId: plan.data!.id,
      batchId: batch.data!.id,
      eventId: event.data!.id,
      deadlineId: deadline.data!.id
    };
  }

  beforeAll(async () => {
    status = readLocalSupabaseStatus();
    await waitForAuth(status);
    admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    expect(
      (
        await admin.rpc("import_catalog_fixture", {
          p_fixture: contentFixture
        })
      ).error
    ).toBeNull();
    expect(
      (
        await admin.rpc("import_storage_rule_profiles", {
          p_profiles: [
            {
              id: `profile-ticket-16-${fixtureId}`,
              storage_rule_id: `rule-ticket-16-${fixtureId}`,
              content_revision_id: `revision-ticket-16-${fixtureId}`,
              storage_location: "refrigerator",
              start_event_kind: "prepared_or_opened",
              precedence: 0,
              duration_min_hours: 168,
              duration_max_hours: 168,
              source_id: `source-ticket-16-${fixtureId}`,
              reviewer_role: "synthetic_operational_reviewer",
              reviewed_at: "2026-07-29",
              approved_at: "2026-07-29",
              next_review_at: "2027-07-29"
            }
          ]
        })
      ).error
    ).toBeNull();
  });

  afterAll(async () => {
    await Promise.all(
      [...remainingUserIds].map((id) => admin.auth.admin.deleteUser(id))
    );
  });

  test("deletion removes the caller household and history atomically and a retry is harmless", async () => {
    const user = await createUser("complete");
    const other = await createUser("other");
    const history = await seedPlanAndInventory(user);
    const profile = await user.client
      .from("user_profiles")
      .select("household_id")
      .single();
    const otherProfile = await other.client
      .from("user_profiles")
      .select("household_id")
      .single();
    expect(profile.error).toBeNull();
    expect(otherProfile.error).toBeNull();
    expect(
      (
        await other.client.rpc("delete_caregiver_account", {
          p_confirmation: "delete",
          p_idempotency_key: crypto.randomUUID()
        })
      ).data
    ).toEqual({
      status: "rejected",
      reason: "confirmation_required"
    });

    expect(
      (
        await user.client.rpc("record_product_event", {
          p_event_name: "today_opened",
          p_event_key: crypto.randomUUID(),
          p_state: "empty"
        })
      ).error
    ).toBeNull();

    const deletionKey = crypto.randomUUID();
    const deleted = await user.client.rpc("delete_caregiver_account", {
      p_confirmation: "DELETE",
      p_idempotency_key: deletionKey
    });
    expect(deleted.error).toBeNull();
    expect(deleted.data).toEqual({ status: "deleted" });
    remainingUserIds.delete(user.id);

    const retry = await user.client.rpc("delete_caregiver_account", {
      p_confirmation: "DELETE",
      p_idempotency_key: deletionKey
    });
    expect(retry.error).toBeNull();
    expect(retry.data).toEqual({ status: "already_deleted" });

    const deletedHousehold = await user.client
      .from("households")
      .select("id")
      .eq("id", profile.data!.household_id);
    expect(deletedHousehold.error).toBeNull();
    expect(deletedHousehold.data).toEqual([]);
    const deletedEvents = await user.client
      .from("product_events")
      .select("id")
      .eq("actor_user_id", user.id);
    expect(deletedEvents.error).toBeNull();
    expect(deletedEvents.data).toEqual([]);
    for (const [table, id] of Object.entries({
      meal_plans: history.planId,
      batches: history.batchId,
      batch_events: history.eventId,
      batch_deadlines: history.deadlineId
    })) {
      const remaining = execFileSync(
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
          `select count(*) from public.${table} where id = '${id}'`
        ],
        { encoding: "utf8" }
      ).trim();
      expect(remaining).toBe("0");
    }
    expect((await admin.auth.admin.getUserById(user.id)).data.user).toBeNull();
    expect(
      (
        await other.client
          .from("households")
          .select("id")
          .eq("id", otherProfile.data!.household_id)
      ).data
    ).toHaveLength(1);
  });

  test("a failed cascade rolls back and the same account can retry after recovery", async () => {
    const user = await createUser("rollback");
    const profile = await user.client
      .from("user_profiles")
      .select("household_id")
      .single();
    const householdId = profile.data!.household_id;
    const tableName = `ticket_16_deletion_block_${fixtureId.replaceAll("-", "")}`;
    execFileSync("docker", [
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
      `create table public.${tableName} (household_id uuid primary key references public.households(id) on delete restrict); insert into public.${tableName} values ('${householdId}');`
    ]);

    const deletionKey = crypto.randomUUID();
    try {
      const failed = await user.client.rpc("delete_caregiver_account", {
        p_confirmation: "DELETE",
        p_idempotency_key: deletionKey
      });
      expect(failed.error?.code).toBe("23503");
      expect(
        (
          await user.client
            .from("user_profiles")
            .select("household_id")
            .single()
        ).data
      ).toEqual({ household_id: householdId });
      expect((await admin.auth.admin.getUserById(user.id)).data.user?.id).toBe(
        user.id
      );
    } finally {
      execFileSync("docker", [
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
        `drop table public.${tableName};`
      ]);
    }

    const recovered = await user.client.rpc("delete_caregiver_account", {
      p_confirmation: "DELETE",
      p_idempotency_key: deletionKey
    });
    expect(recovered.error).toBeNull();
    expect(recovered.data).toEqual({ status: "deleted" });
    remainingUserIds.delete(user.id);
  });

  test("only service-role operations can retire content or disable automatic generation", async () => {
    const user = await createUser("operator-boundary");
    const revisionId = `revision-ticket-16-${fixtureId}`;
    const retirementKey = crypto.randomUUID();
    expect(
      (
        await user.client.rpc("save_feeding_configuration", {
          p_skill_statuses: [
            {
              skill_id: `skill-ticket-16-${fixtureId}`,
              status: "observed"
            }
          ],
          p_restrictions: [
            {
              food_id: `food-ticket-16-${fixtureId}`,
              status: "no_known_restriction"
            }
          ],
          p_exposures: [
            {
              food_id: `food-ticket-16-${fixtureId}`,
              state: "unknown"
            }
          ],
          p_new_food_pace: "one_per_week",
          p_preparation_time: "under_30_minutes",
          p_prep_day: 6,
          p_quick_backup_food_ids: []
        })
      ).error
    ).toBeNull();
    const history = await seedPlanAndInventory(user);
    const snapshot = await user.client.rpc("get_planner_generation_snapshot", {
      p_reference_at: new Date().toISOString()
    });
    expect(snapshot.error).toBeNull();
    const generation = buildPlannerGenerationAttempt(snapshot.data);
    if (generation.status !== "feasible") {
      throw new Error(`Expected feasible generation: ${generation.reason}`);
    }

    const releaseGeneration = await holdDatabaseRow("babies", history.babyId);
    let generationCommit:
      Promise<Awaited<ReturnType<SupabaseClient["rpc"]>>> | undefined;
    let disableRequest:
      Promise<Awaited<ReturnType<SupabaseClient["rpc"]>>> | undefined;
    try {
      generationCommit = Promise.resolve(
        user.client.rpc("commit_generated_week", {
          p_expected_version: generation.expectedVersion,
          p_input_token: generation.inputToken,
          p_reference_at: generation.referenceAt,
          p_output: generation.output,
          p_idempotency_key: crypto.randomUUID()
        })
      );
      await waitForBlockedGenerationCommit();
      disableRequest = Promise.resolve(
        admin.rpc("set_operational_control", {
          p_control_key: "automatic_generation",
          p_disabled: true,
          p_incident_reference: "INC-2026-002",
          p_reason: "Synthetic planner disable rehearsal",
          p_idempotency_key: crypto.randomUUID()
        })
      );
      expect(
        await Promise.race([
          disableRequest.then(() => "disabled"),
          new Promise((resolve) => setTimeout(() => resolve("blocked"), 200))
        ])
      ).toBe("blocked");
    } finally {
      await releaseGeneration();
    }

    const committedGeneration = await generationCommit!;
    expect(committedGeneration.error).toBeNull();
    expect(committedGeneration.data.status).toBe("committed");
    const disabled = await disableRequest!;
    expect(disabled.error).toBeNull();
    expect(
      (
        await user.client.rpc("get_planner_generation_snapshot", {
          p_reference_at: new Date().toISOString()
        })
      ).data
    ).toEqual({
      status: "unavailable",
      reason: "automatic_generation_disabled"
    });
    expect(
      (
        await user.client.rpc("commit_generated_week", {
          p_expected_version: generation.expectedVersion,
          p_input_token: generation.inputToken,
          p_reference_at: generation.referenceAt,
          p_output: generation.output,
          p_idempotency_key: crypto.randomUUID()
        })
      ).data
    ).toEqual({
      status: "rejected",
      reason: "automatic_generation_disabled"
    });
    expect(
      (
        await admin.rpc("set_operational_control", {
          p_control_key: "automatic_generation",
          p_disabled: false,
          p_incident_reference: "INC-2026-002",
          p_reason: "Synthetic planner restore rehearsal",
          p_idempotency_key: crypto.randomUUID()
        })
      ).error
    ).toBeNull();

    const unauthorizedRetirement = await user.client.rpc(
      "emergency_retire_content_revision",
      {
        p_revision_id: revisionId,
        p_incident_reference: "INC-UNAUTHORIZED",
        p_reason: "Unauthorized attempt",
        p_idempotency_key: retirementKey
      }
    );
    expect(unauthorizedRetirement.error?.code).toBe("42501");

    const generatedComponents = await admin
      .from("meal_components")
      .select("id")
      .eq("revision_id", revisionId)
      .limit(1);
    expect(generatedComponents.error).toBeNull();
    const generatedComponentId = generatedComponents.data?.[0]?.id;
    expect(generatedComponentId).toBeTruthy();

    const releaseContentTable = await holdDatabaseTable("storage_rules");
    const inFlightPublishedRead = Promise.resolve(
      user.client.rpc("list_published_preparations")
    );
    await waitForBlockedRequests(1);
    const inFlightKitchenRead = Promise.resolve(
      user.client.rpc("get_kitchen_inventory")
    );
    await waitForBlockedRequests(2);

    const releaseBaby = await holdDatabaseRow("babies", history.babyId);
    const releaseBatch = await holdDatabaseRow("batches", history.batchId);
    let contentUseRequest:
      Promise<Awaited<ReturnType<SupabaseClient["rpc"]>>> | undefined;
    let transitionRequest:
      Promise<Awaited<ReturnType<SupabaseClient["rpc"]>>> | undefined;
    let retirementRequests:
      | Promise<
          [
            Awaited<ReturnType<SupabaseClient["rpc"]>>,
            Awaited<ReturnType<SupabaseClient["rpc"]>>
          ]
        >
      | undefined;
    try {
      contentUseRequest = Promise.resolve(
        user.client.rpc("create_refrigerated_batch", {
          p_meal_component_id: generatedComponentId!,
          p_prepared_or_opened_at: new Date().toISOString(),
          p_portion_count: 1,
          p_idempotency_key: crypto.randomUUID(),
          p_storage_location: "refrigerator"
        })
      );
      await waitForBlockedRequests(3);
      transitionRequest = Promise.resolve(
        user.client.rpc("perform_batch_transition", {
          p_batch_id: history.batchId,
          p_transition: "finish",
          p_payload: {},
          p_idempotency_key: crypto.randomUUID()
        })
      );
      await waitForBlockedRequests(4);
      retirementRequests = Promise.all([
        admin.rpc("emergency_retire_content_revision", {
          p_revision_id: revisionId,
          p_incident_reference: "INC-2026-001",
          p_reason: "Synthetic operational rehearsal",
          p_idempotency_key: retirementKey
        }),
        admin.rpc("emergency_retire_content_revision", {
          p_revision_id: revisionId,
          p_incident_reference: "INC-2026-001",
          p_reason: "Synthetic operational rehearsal",
          p_idempotency_key: retirementKey
        })
      ]);
      expect(
        await Promise.race([
          retirementRequests.then(() => "retired"),
          new Promise((resolve) => setTimeout(() => resolve("blocked"), 200))
        ])
      ).toBe("blocked");
    } finally {
      await releaseContentTable();
      const publishedBeforeRetirement = await inFlightPublishedRead;
      expect(publishedBeforeRetirement.error).toBeNull();
      expect(
        publishedBeforeRetirement.data.some(
          (entry: { slug: string }) =>
            entry.slug === `ticket-16-preparation-${fixtureId}`
        )
      ).toBe(true);
      const kitchenBeforeRetirement = await inFlightKitchenRead;
      expect(kitchenBeforeRetirement.error).toBeNull();
      expect(
        kitchenBeforeRetirement.data.items.find(
          (entry: { batch_id: string }) => entry.batch_id === history.batchId
        )
      ).toEqual(
        expect.objectContaining({
          available_actions: expect.any(Array)
        })
      );
      await releaseBaby();
      await releaseBatch();
    }

    const contentUse = await contentUseRequest!;
    expect(contentUse.error).toBeNull();
    expect(contentUse.data).toEqual(
      expect.objectContaining({ status: "created" })
    );
    const transition = await transitionRequest!;
    expect(transition.error).toBeNull();
    expect(transition.data).toEqual(
      expect.objectContaining({
        status: "applied",
        lifecycle_state: "finished"
      })
    );
    const [retired, retirementRetry] = await retirementRequests!;
    expect(retired.error).toBeNull();
    expect(retired.data).toEqual({
      status: "retired",
      revision_id: revisionId
    });
    expect(retirementRetry.error).toBeNull();
    expect(retirementRetry.data).toEqual(retired.data);

    const kitchenAfterRetirement = await user.client.rpc(
      "get_kitchen_inventory"
    );
    expect(kitchenAfterRetirement.error).toBeNull();
    expect(
      kitchenAfterRetirement.data.items.find(
        (entry: { batch_id: string }) =>
          entry.batch_id === contentUse.data.batch_id
      )
    ).toEqual(
      expect.objectContaining({
        available_actions: ["finish", "correct", "discard"],
        action_guidance: null
      })
    );

    const batchCountBeforeRejectedUse = (
      await admin
        .from("prepared_batches")
        .select("id", { count: "exact", head: true })
        .eq("content_revision_id", revisionId)
    ).count;
    const blockedAfterRetirement = await user.client.rpc(
      "create_refrigerated_batch",
      {
        p_meal_component_id: generatedComponentId!,
        p_prepared_or_opened_at: new Date().toISOString(),
        p_portion_count: 1,
        p_idempotency_key: crypto.randomUUID(),
        p_storage_location: "refrigerator"
      }
    );
    expect(blockedAfterRetirement.error).toBeNull();
    expect(blockedAfterRetirement.data.status).not.toBe("created");
    expect(
      (
        await admin
          .from("prepared_batches")
          .select("id", { count: "exact", head: true })
          .eq("content_revision_id", revisionId)
      ).count
    ).toBe(batchCountBeforeRejectedUse);

    const published = await user.client.rpc("list_published_preparations");
    expect(
      published.data.some(
        (entry: { slug: string }) =>
          entry.slug === `ticket-16-preparation-${fixtureId}`
      )
    ).toBe(false);
    expect(
      (
        await admin
          .from("content_revisions")
          .select("id,source_id")
          .eq("id", revisionId)
          .single()
      ).data
    ).toEqual({
      id: revisionId,
      source_id: `source-ticket-16-${fixtureId}`
    });
    expect(
      (
        await admin
          .from("storage_rules")
          .select("id,revision_id")
          .eq("revision_id", revisionId)
          .single()
      ).data
    ).toEqual({
      id: `rule-ticket-16-${fixtureId}`,
      revision_id: revisionId
    });
    expect(
      (
        await admin
          .from("batch_events")
          .select("id,batch_id")
          .eq("id", history.eventId)
          .single()
      ).data
    ).toEqual({ id: history.eventId, batch_id: history.batchId });
    expect(
      (
        await admin
          .from("batch_deadlines")
          .select("id,content_revision_id,storage_rule_id,rule_profile_id")
          .eq("id", history.deadlineId)
          .single()
      ).data
    ).toEqual({
      id: history.deadlineId,
      content_revision_id: revisionId,
      storage_rule_id: `rule-ticket-16-${fixtureId}`,
      rule_profile_id: `profile-ticket-16-${fixtureId}`
    });
    expect(
      (
        await admin
          .from("sources")
          .select("id,title")
          .eq("id", `source-ticket-16-${fixtureId}`)
          .single()
      ).data
    ).toEqual({
      id: `source-ticket-16-${fixtureId}`,
      title: "Synthetic operational source"
    });

    const unauthorizedDisable = await user.client.rpc(
      "set_operational_control",
      {
        p_control_key: "automatic_generation",
        p_disabled: true,
        p_incident_reference: "INC-UNAUTHORIZED",
        p_reason: "Unauthorized attempt",
        p_idempotency_key: crypto.randomUUID()
      }
    );
    expect(unauthorizedDisable.error?.code).toBe("42501");
  });

  test("missing operational controls fail closed for caregivers and operators", async () => {
    const user = await createUser("missing-controls");

    runPsql(
      "delete from public.operational_controls where control_key = 'automatic_generation'"
    );
    try {
      const snapshot = await user.client.rpc(
        "get_planner_generation_snapshot",
        {
          p_reference_at: new Date().toISOString()
        }
      );
      expect(snapshot.error?.code).toBe("55000");

      const operatorUpdate = await admin.rpc("set_operational_control", {
        p_control_key: "automatic_generation",
        p_disabled: true,
        p_incident_reference: "INC-2026-MISSING",
        p_reason: "Synthetic missing-control rehearsal",
        p_idempotency_key: crypto.randomUUID()
      });
      expect(operatorUpdate.error?.code).toBe("55000");
    } finally {
      runPsql(`
        insert into public.operational_controls (
          control_key,
          is_disabled,
          incident_reference,
          reason
        ) values (
          'automatic_generation',
          false,
          null,
          null
        )
      `);
    }

    runPsql(
      "delete from public.operational_controls where control_key = 'content_publication'"
    );
    try {
      const catalog = await user.client.rpc("list_published_preparations");
      expect(catalog.error?.code).toBe("55000");

      const contentUse = await user.client.rpc(
        "plan_preparation_for_tomorrow",
        {
          p_baby_id: crypto.randomUUID(),
          p_preparation_slug: "missing-control",
          p_meal_slot: "breakfast"
        }
      );
      expect(contentUse.error?.code).toBe("55000");
    } finally {
      runPsql(`
        insert into public.operational_controls (
          control_key,
          is_disabled,
          incident_reference,
          reason
        ) values (
          'content_publication',
          false,
          null,
          null
        )
      `);
    }
  });
});
