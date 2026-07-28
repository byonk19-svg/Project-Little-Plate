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

type TestUser = {
  id: string;
  client: SupabaseClient;
};

const createdUserIds: string[] = [];
const transactionReadyMarker = "ticket-05-transaction-ready";
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

async function waitForBlockedPlannerRequest(): Promise<void> {
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
          and cardinality(pg_blocking_pids(pid)) > 0`
    ]);

    if (Number(stdout.trim()) > 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error("Timed out waiting for the planner RPC to block");
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

function ticketFiveFixture() {
  return {
    sources: [
      {
        id: "source-ticket-05",
        publisher: "Synthetic Ticket 05 publisher",
        title: "Synthetic Ticket 05 source",
        url: "https://example.test/ticket-05",
        source_date: "2026-01-01",
        accessed_at: "2026-07-27"
      }
    ],
    tags: [
      {
        id: "skill-ticket-05-observed",
        kind: "skill",
        label: "Synthetic observed ability"
      },
      {
        id: "skill-ticket-05-unobserved",
        kind: "skill",
        label: "Synthetic unobserved ability"
      },
      {
        id: "allergen-ticket-05",
        kind: "allergen",
        label: "Synthetic allergen marker"
      }
    ],
    foods: Array.from({ length: 6 }, (_, index) => ({
      id: `food-ticket-05-${index + 1}`,
      slug: `ticket-05-food-${index + 1}`,
      name: `Ticket 05 Food ${index + 1}`,
      category: "synthetic-test-fixture"
    })),
    preparations: [
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `prep-ticket-05-${index + 1}`,
        food_id: `food-ticket-05-${index + 1}`,
        slug: `ticket-05-preparation-${index + 1}`,
        name: `Ticket 05 Preparation ${index + 1}`,
        is_active: true
      })),
      {
        id: "prep-ticket-05-draft",
        food_id: "food-ticket-05-6",
        slug: "ticket-05-draft",
        name: "Ticket 05 Draft",
        is_active: true
      },
      {
        id: "prep-ticket-05-retired",
        food_id: "food-ticket-05-6",
        slug: "ticket-05-retired",
        name: "Ticket 05 Retired",
        is_active: true
      }
    ],
    revisions: [
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `revision-ticket-05-${index + 1}`,
        preparation_id: `prep-ticket-05-${index + 1}`,
        version: 1,
        status: "approved",
        method: "SYNTHETIC TEST METHOD",
        shape_texture: "SYNTHETIC TEST TEXTURE",
        source_id: "source-ticket-05",
        reviewer_role: "synthetic_test_reviewer",
        reviewed_at: "2026-07-27",
        approved_at: "2026-07-27",
        next_review_at: "2027-07-27",
        tag_ids: [
          index === 4
            ? "skill-ticket-05-unobserved"
            : "skill-ticket-05-observed",
          "allergen-ticket-05"
        ],
        storage_rules: [
          {
            id: `rule-ticket-05-${index + 1}`,
            support_status: "unsupported",
            deadline_kind: null,
            duration_hours: null,
            guidance: null
          }
        ]
      })),
      {
        id: "revision-ticket-05-draft",
        preparation_id: "prep-ticket-05-draft",
        version: 1,
        status: "draft",
        method: "SYNTHETIC TEST METHOD",
        shape_texture: "SYNTHETIC TEST TEXTURE",
        source_id: "source-ticket-05",
        reviewer_role: null,
        reviewed_at: null,
        approved_at: null,
        next_review_at: null,
        tag_ids: ["skill-ticket-05-observed", "allergen-ticket-05"],
        storage_rules: [
          {
            id: "rule-ticket-05-draft",
            support_status: "unsupported",
            deadline_kind: null,
            duration_hours: null,
            guidance: null
          }
        ]
      },
      {
        id: "revision-ticket-05-retired",
        preparation_id: "prep-ticket-05-retired",
        version: 1,
        status: "approved",
        method: "SYNTHETIC TEST METHOD",
        shape_texture: "SYNTHETIC TEST TEXTURE",
        source_id: "source-ticket-05",
        reviewer_role: "synthetic_test_reviewer",
        reviewed_at: "2026-07-27",
        approved_at: "2026-07-27",
        next_review_at: "2027-07-27",
        tag_ids: ["skill-ticket-05-observed", "allergen-ticket-05"],
        storage_rules: [
          {
            id: "rule-ticket-05-retired",
            support_status: "unsupported",
            deadline_kind: null,
            duration_hours: null,
            guidance: null
          }
        ]
      }
    ],
    retirements: [
      {
        revision_id: "revision-ticket-05-retired",
        retired_at: "2026-07-27",
        reason: "SYNTHETIC TEST RETIREMENT"
      }
    ]
  };
}

describe("manual meal planning", () => {
  let status: LocalSupabaseStatus;
  let admin: SupabaseClient;
  let anonymous: SupabaseClient;
  let householdA: TestUser;
  let householdB: TestUser;
  let babyAId: string;
  let babyBId: string;
  let fixtureImported = false;

  async function createTestUser(label: string): Promise<TestUser> {
    const email = `ticket-05-${label}-${crypto.randomUUID()}@example.test`;
    const password = `Ticket-05-${crypto.randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    expect(error).toBeNull();
    createdUserIds.push(data.user!.id);

    const authClient = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: sessionData, error: sessionError } =
      await authClient.auth.signInWithPassword({ email, password });

    expect(sessionError).toBeNull();
    return {
      id: data.user!.id,
      client: authenticatedClient(status, sessionData.session!.access_token)
    };
  }

  async function createBaby(
    user: TestUser,
    nickname: string,
    timeZone: string,
    mealSlots: string[]
  ) {
    await user.client.rpc("bootstrap_account");
    const result = await user.client.rpc("complete_baby_profile", {
      p_nickname: nickname,
      p_birth_date: "2025-10-15",
      p_time_zone: timeZone,
      p_feeding_style: "mixed",
      p_meal_slots: mealSlots
    });
    expect(result.error).toBeNull();
    return result.data as string;
  }

  async function configureEligible(
    user: TestUser,
    overrides: {
      firstFoodStatus?: string;
      includeUnobservedSkill?: boolean;
    } = {}
  ) {
    const result = await user.client.rpc("save_feeding_configuration", {
      p_skill_statuses: [
        { skill_id: "skill-ticket-05-observed", status: "observed" },
        ...(overrides.includeUnobservedSkill
          ? [
              {
                skill_id: "skill-ticket-05-unobserved",
                status: "not_sure"
              }
            ]
          : [])
      ],
      p_restrictions: Array.from({ length: 5 }, (_, index) => ({
        food_id: `food-ticket-05-${index + 1}`,
        status:
          index === 0
            ? (overrides.firstFoodStatus ?? "no_known_restriction")
            : "no_known_restriction"
      })),
      p_exposures: [],
      p_new_food_pace: "one_per_week",
      p_preparation_time: "under_30_minutes",
      p_prep_day: null,
      p_quick_backup_food_ids: ["food-ticket-05-4"]
    });
    expect(result.error).toBeNull();
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
      p_fixture: ticketFiveFixture()
    });
    expect(imported.error).toBeNull();
    fixtureImported = true;

    householdA = await createTestUser("household-a");
    householdB = await createTestUser("household-b");
    babyAId = await createBaby(householdA, "Juniper", "America/Chicago", [
      "breakfast",
      "dinner"
    ]);
    babyBId = await createBaby(householdB, "Other baby", "America/New_York", [
      "breakfast"
    ]);
    await configureEligible(householdA);
    await configureEligible(householdB);
  });

  afterAll(async () => {
    if (!admin || !fixtureImported) {
      return;
    }

    const deletedUsers = await Promise.all(
      createdUserIds.map((userId) => admin.auth.admin.deleteUser(userId))
    );
    for (const result of deletedUsers) {
      expect(result.error).toBeNull();
    }

    const approvedRevisions = [
      "revision-ticket-05-1",
      "revision-ticket-05-2",
      "revision-ticket-05-3",
      "revision-ticket-05-4",
      "revision-ticket-05-5"
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

  test("an eligible reviewed preparation is saved for tomorrow and returned in the seven-day Week read model", async () => {
    const result = await householdA.client.rpc(
      "plan_preparation_for_tomorrow",
      {
        p_baby_id: babyAId,
        p_preparation_slug: "ticket-05-preparation-1",
        p_meal_slot: "breakfast"
      }
    );

    expect(result.error).toBeNull();
    expect(result.data).toEqual(
      expect.objectContaining({
        status: "planned",
        preparation_id: "prep-ticket-05-1",
        revision_id: "revision-ticket-05-1",
        meal_slot: "breakfast"
      })
    );

    const week = await householdA.client.rpc("get_current_week");
    expect(week.error).toBeNull();
    expect(week.data.time_zone).toBe("America/Chicago");
    expect(week.data.days).toHaveLength(7);
    expect(
      week.data.days.every(
        (day: { slots: unknown[] }) => day.slots.length === 2
      )
    ).toBe(true);
    expect(week.data.days[1].local_date).toBe(result.data.local_date);
    expect(week.data.days[1].slots[0].components).toEqual([
      expect.objectContaining({
        preparation_id: "prep-ticket-05-1",
        revision_id: "revision-ticket-05-1",
        preparation_name: "Ticket 05 Preparation 1",
        food_name: "Ticket 05 Food 1"
      })
    ]);
  });

  test("a complete manual week supports locks, edits, swaps, bounded undo, copy, quick backup, and lifecycle state", async () => {
    const editor = await createTestUser("week-editor");
    await createBaby(editor, "Week editor baby", "America/Chicago", [
      "breakfast",
      "dinner"
    ]);
    await configureEligible(editor);

    const initialWeek = await editor.client.rpc("get_week_window", {
      p_window_start: null
    });
    expect(initialWeek.error).toBeNull();
    expect(initialWeek.data).toEqual(
      expect.objectContaining({
        status: "ready",
        version: 0,
        variety_summary: {
          planned_meals: 0,
          distinct_foods: 0,
          copy: "Plan a few reviewed foods when you are ready."
        }
      })
    );
    expect(initialWeek.data.days).toHaveLength(7);
    expect(
      initialWeek.data.days.every(
        (day: { slots: unknown[] }) => day.slots.length === 2
      )
    ).toBe(true);

    let version = 0;
    const targetDate = initialWeek.data.days[1].local_date as string;
    const copyDate = initialWeek.data.days[2].local_date as string;
    const apply = async (
      operation: string,
      payload: Record<string, unknown>
    ) => {
      const result = await editor.client.rpc("edit_manual_week", {
        p_expected_version: version,
        p_operation: operation,
        p_payload: payload,
        p_idempotency_key: crypto.randomUUID()
      });
      expect(result.error).toBeNull();
      if (result.data.status === "applied") {
        version = result.data.version;
      }
      return result.data;
    };

    const added = await apply("add_component", {
      local_date: targetDate,
      meal_slot: "breakfast",
      preparation_slug: "ticket-05-preparation-1"
    });
    expect(added).toEqual(
      expect.objectContaining({
        status: "applied",
        operation: "add_component",
        version: 1
      })
    );
    const mealId = added.meal_id as string;
    const originalComponentId = added.component_id as string;

    expect(
      await apply("set_component_lock", {
        component_id: originalComponentId,
        locked: true
      })
    ).toEqual(
      expect.objectContaining({
        status: "applied",
        operation: "set_component_lock",
        version: 2
      })
    );
    const lockedSwap = await apply("swap_component", {
      component_id: originalComponentId,
      preparation_slug: "ticket-05-preparation-2"
    });
    expect(lockedSwap).toEqual({
      status: "rejected",
      reason: "component_locked",
      version: 2
    });

    await apply("set_component_lock", {
      component_id: originalComponentId,
      locked: false
    });
    const swapped = await apply("swap_component", {
      component_id: originalComponentId,
      preparation_slug: "ticket-05-preparation-2"
    });
    expect(swapped).toEqual(
      expect.objectContaining({
        status: "applied",
        operation: "swap_component",
        version: 4,
        preparation_id: "prep-ticket-05-2"
      })
    );

    const undone = await apply("undo_last_swap", {});
    expect(undone).toEqual(
      expect.objectContaining({
        status: "applied",
        operation: "undo_last_swap",
        compensated_operation: "swap_component",
        version: 5
      })
    );

    const addedSecond = await apply("add_component", {
      local_date: targetDate,
      meal_slot: "breakfast",
      preparation_slug: "ticket-05-preparation-3"
    });
    expect(addedSecond.version).toBe(6);

    await apply("set_meal_lock", { meal_id: mealId, locked: true });
    const lockedDelete = await apply("delete_component", {
      component_id: addedSecond.component_id
    });
    expect(lockedDelete).toEqual({
      status: "rejected",
      reason: "meal_locked",
      version: 7
    });
    await apply("set_meal_lock", { meal_id: mealId, locked: false });
    expect(
      await apply("delete_component", {
        component_id: addedSecond.component_id
      })
    ).toEqual(
      expect.objectContaining({
        status: "applied",
        operation: "delete_component",
        version: 9
      })
    );

    const copied = await apply("copy_meal", {
      source_meal_id: mealId,
      target_local_date: copyDate,
      target_meal_slot: "dinner"
    });
    expect(copied).toEqual(
      expect.objectContaining({
        status: "applied",
        operation: "copy_meal",
        version: 10
      })
    );
    const copiedMealId = copied.meal_id as string;

    const swappedMeal = await apply("swap_meal", {
      meal_id: copiedMealId,
      preparation_slug: "ticket-05-preparation-3"
    });
    expect(swappedMeal).toEqual(
      expect.objectContaining({
        status: "applied",
        operation: "swap_meal",
        preparation_id: "prep-ticket-05-3",
        version: 11
      })
    );

    const quickBackup = await apply("use_quick_backup", {
      meal_id: copiedMealId,
      preparation_slug: "ticket-05-preparation-4"
    });
    expect(quickBackup).toEqual(
      expect.objectContaining({
        status: "applied",
        operation: "use_quick_backup",
        preparation_id: "prep-ticket-05-4",
        version: 12
      })
    );
    expect(
      await apply("set_meal_status", {
        meal_id: copiedMealId,
        status: "skipped"
      })
    ).toEqual(expect.objectContaining({ status: "applied", version: 13 }));
    expect(
      await apply("set_meal_status", {
        meal_id: copiedMealId,
        status: "completed"
      })
    ).toEqual(expect.objectContaining({ status: "applied", version: 14 }));

    const stale = await editor.client.rpc("edit_manual_week", {
      p_expected_version: 13,
      p_operation: "set_meal_status",
      p_payload: { meal_id: copiedMealId, status: "planned" },
      p_idempotency_key: crypto.randomUUID()
    });
    expect(stale.error).toBeNull();
    expect(stale.data).toEqual({
      status: "rejected",
      reason: "plan_stale",
      version: 14
    });

    const blocked = await apply("swap_meal", {
      meal_id: mealId,
      preparation_slug: "ticket-05-preparation-5"
    });
    expect(blocked).toEqual(
      expect.objectContaining({
        status: "rejected",
        reason: "required_ability_not_observed",
        version: 14
      })
    );
    expect(
      await apply("set_meal_status", {
        meal_id: mealId,
        status: "skipped"
      })
    ).toEqual(expect.objectContaining({ status: "applied", version: 15 }));
    const crossHousehold = await householdB.client.rpc("edit_manual_week", {
      p_expected_version: 0,
      p_operation: "set_meal_lock",
      p_payload: { meal_id: copiedMealId, locked: true },
      p_idempotency_key: crypto.randomUUID()
    });
    expect(crossHousehold.error).toBeNull();
    expect(crossHousehold.data).toEqual({
      status: "rejected",
      reason: "meal_unavailable",
      version: 0
    });
    const todayAfterStatuses = await editor.client.rpc("get_today_meal");
    expect(todayAfterStatuses.error).toBeNull();
    expect(todayAfterStatuses.data).toEqual(
      expect.objectContaining({ status: "empty" })
    );

    const refreshed = await editor.client.rpc("get_week_window", {
      p_window_start: initialWeek.data.window_start
    });
    expect(refreshed.error).toBeNull();
    expect(refreshed.data.version).toBe(15);
    expect(refreshed.data.variety_summary).toEqual({
      planned_meals: 0,
      distinct_foods: 0,
      copy: "Plan a few reviewed foods when you are ready."
    });
    const originalSlot = refreshed.data.days[1].slots[0];
    expect(originalSlot).toEqual(
      expect.objectContaining({
        meal_id: mealId,
        status: "skipped",
        is_locked: false,
        components: [
          expect.objectContaining({
            preparation_id: "prep-ticket-05-1",
            is_locked: false
          })
        ]
      })
    );
    const copiedSlot = refreshed.data.days[2].slots[1];
    expect(copiedSlot).toEqual(
      expect.objectContaining({
        meal_id: copiedMealId,
        status: "completed",
        is_locked: false,
        components: [
          expect.objectContaining({
            preparation_id: "prep-ticket-05-4",
            is_quick_backup: true
          })
        ]
      })
    );

    const priorWindow = await editor.client.rpc("get_week_window", {
      p_window_start: new Date(`${initialWeek.data.window_start}T00:00:00.000Z`)
        .toISOString()
        .slice(0, 10)
    });
    expect(priorWindow.error).toBeNull();
    expect(priorWindow.data.days).toHaveLength(7);

    const editEvents = await editor.client
      .from("meal_edit_events")
      .select("operation, compensates_event_id")
      .eq("plan_id", refreshed.data.plan_id)
      .order("version");
    expect(editEvents.error).toBeNull();
    expect(editEvents.data).toHaveLength(15);
    expect(
      editEvents.data?.some(({ operation }) => operation === "swap_component")
    ).toBe(true);
    expect(
      editEvents.data?.some(
        ({ operation, compensates_event_id }) =>
          operation === "undo_last_swap" && compensates_event_id !== null
      )
    ).toBe(true);

    await configureEligible(editor, {
      firstFoodStatus: "temporary_avoidance"
    });
    const restrictedRefresh = await editor.client.rpc("get_week_window", {
      p_window_start: initialWeek.data.window_start
    });
    expect(restrictedRefresh.error).toBeNull();
    expect(restrictedRefresh.data.days[1].slots[0].components[0]).toEqual(
      expect.objectContaining({
        availability_state: "replacement_required",
        unavailable_reason: "food_restricted"
      })
    );
    await configureEligible(editor);
  });

  test("edit retries are payload-bound, concurrent versions serialize, and rejected edits are atomic", async () => {
    const editor = await createTestUser("week-concurrency");
    await createBaby(editor, "Concurrent editor baby", "America/Chicago", [
      "breakfast",
      "dinner"
    ]);
    await configureEligible(editor);

    const initial = await editor.client.rpc("get_week_window", {
      p_window_start: null
    });
    expect(initial.error).toBeNull();
    const targetDate = initial.data.days[1].local_date as string;
    const rejectedWithoutPlan = await editor.client.rpc("edit_manual_week", {
      p_expected_version: 0,
      p_operation: "set_meal_lock",
      p_payload: { meal_id: crypto.randomUUID(), locked: true },
      p_idempotency_key: crypto.randomUUID()
    });
    expect(rejectedWithoutPlan.error).toBeNull();
    expect(rejectedWithoutPlan.data).toEqual({
      status: "rejected",
      reason: "meal_unavailable",
      version: 0
    });
    const afterRejectedWithoutPlan = await editor.client.rpc(
      "get_week_window",
      { p_window_start: initial.data.window_start }
    );
    expect(afterRejectedWithoutPlan.error).toBeNull();
    expect(afterRejectedWithoutPlan.data).toEqual(initial.data);

    const idempotencyKey = crypto.randomUUID();
    const firstPayload = {
      local_date: targetDate,
      meal_slot: "breakfast",
      preparation_slug: "ticket-05-preparation-1"
    };
    const first = await editor.client.rpc("edit_manual_week", {
      p_expected_version: 0,
      p_operation: "add_component",
      p_payload: firstPayload,
      p_idempotency_key: idempotencyKey
    });
    expect(first.error).toBeNull();
    expect(first.data).toEqual(
      expect.objectContaining({
        status: "applied",
        version: 1,
        idempotent_retry: false
      })
    );

    const retried = await editor.client.rpc("edit_manual_week", {
      p_expected_version: 0,
      p_operation: "add_component",
      p_payload: firstPayload,
      p_idempotency_key: idempotencyKey
    });
    expect(retried.error).toBeNull();
    expect(retried.data).toEqual({
      ...first.data,
      idempotent_retry: true
    });

    const conflictingRetry = await editor.client.rpc("edit_manual_week", {
      p_expected_version: 1,
      p_operation: "add_component",
      p_payload: {
        ...firstPayload,
        preparation_slug: "ticket-05-preparation-2"
      },
      p_idempotency_key: idempotencyKey
    });
    expect(conflictingRetry.error).toBeNull();
    expect(conflictingRetry.data).toEqual({
      status: "rejected",
      reason: "idempotency_key_conflict",
      version: 1
    });

    const concurrentPayloads = [
      {
        local_date: targetDate,
        meal_slot: "breakfast",
        preparation_slug: "ticket-05-preparation-2"
      },
      {
        local_date: targetDate,
        meal_slot: "dinner",
        preparation_slug: "ticket-05-preparation-3"
      }
    ];
    const concurrent = await Promise.all(
      concurrentPayloads.map((payload) =>
        editor.client.rpc("edit_manual_week", {
          p_expected_version: 1,
          p_operation: "add_component",
          p_payload: payload,
          p_idempotency_key: crypto.randomUUID()
        })
      )
    );
    expect(concurrent.every(({ error }) => error === null)).toBe(true);
    expect(
      concurrent.filter(({ data }) => data.status === "applied")
    ).toHaveLength(1);
    expect(
      concurrent.filter(
        ({ data }) =>
          data.status === "rejected" &&
          data.reason === "plan_stale" &&
          data.version === 2
      )
    ).toHaveLength(1);

    const beforeRejected = await editor.client.rpc("get_week_window", {
      p_window_start: initial.data.window_start
    });
    expect(beforeRejected.error).toBeNull();
    expect(beforeRejected.data.version).toBe(2);
    const invalidLock = await editor.client.rpc("edit_manual_week", {
      p_expected_version: 2,
      p_operation: "set_meal_lock",
      p_payload: { meal_id: first.data.meal_id },
      p_idempotency_key: crypto.randomUUID()
    });
    expect(invalidLock.error).toBeNull();
    expect(invalidLock.data).toEqual({
      status: "rejected",
      reason: "invalid_lock_state",
      version: 2
    });
    const afterRejected = await editor.client.rpc("get_week_window", {
      p_window_start: initial.data.window_start
    });
    expect(afterRejected.error).toBeNull();
    expect(afterRejected.data).toEqual(beforeRejected.data);

    const events = await editor.client
      .from("meal_edit_events")
      .select("version")
      .eq("plan_id", first.data.plan_id ?? beforeRejected.data.plan_id);
    expect(events.error).toBeNull();
    expect(events.data).toHaveLength(2);
  });

  test("one meal accepts at most three distinct preparation components", async () => {
    for (const preparation of [2, 3]) {
      const result = await householdA.client.rpc(
        "plan_preparation_for_tomorrow",
        {
          p_baby_id: babyAId,
          p_preparation_slug: `ticket-05-preparation-${preparation}`,
          p_meal_slot: "breakfast"
        }
      );
      expect(result.data.status).toBe("planned");
    }

    const before = await householdA.client.rpc("get_current_week");
    const fourth = await householdA.client.rpc(
      "plan_preparation_for_tomorrow",
      {
        p_baby_id: babyAId,
        p_preparation_slug: "ticket-05-preparation-4",
        p_meal_slot: "breakfast"
      }
    );
    const after = await householdA.client.rpc("get_current_week");

    expect(fourth.error).toBeNull();
    expect(fourth.data).toEqual({
      status: "rejected",
      reason: "meal_component_limit_reached"
    });
    expect(after.data).toEqual(before.data);
  });

  test("cross-household, restricted, reaction-blocked, incompatible, unpublished, retired, and unsupported commands leave the plan unchanged", async () => {
    const attempts: Array<{
      client: SupabaseClient;
      slug: string;
      expectedReason: string;
      prepare?: () => Promise<void>;
      restore?: () => Promise<void>;
    }> = [
      {
        client: householdB.client,
        slug: "ticket-05-preparation-1",
        expectedReason: "baby_not_accessible"
      },
      {
        client: householdA.client,
        slug: "ticket-05-preparation-1",
        expectedReason: "food_restricted",
        prepare: async () => {
          await configureEligible(householdA, {
            firstFoodStatus: "temporary_avoidance"
          });
        },
        restore: async () => configureEligible(householdA)
      },
      {
        client: householdA.client,
        slug: "ticket-05-preparation-1",
        expectedReason: "food_restricted",
        prepare: async () => {
          await admin.from("baby_food_restrictions").upsert({
            baby_id: babyAId,
            food_id: "food-ticket-05-1",
            status: "reaction_reported"
          });
        },
        restore: async () => {
          await admin
            .from("baby_food_restrictions")
            .update({ status: "no_known_restriction" })
            .eq("baby_id", babyAId)
            .eq("food_id", "food-ticket-05-1");
        }
      },
      {
        client: householdA.client,
        slug: "ticket-05-preparation-5",
        expectedReason: "required_ability_not_observed",
        prepare: async () => {
          await configureEligible(householdA, {
            includeUnobservedSkill: true
          });
        },
        restore: async () => configureEligible(householdA)
      },
      {
        client: householdA.client,
        slug: "ticket-05-draft",
        expectedReason: "preparation_not_approved"
      },
      {
        client: householdA.client,
        slug: "ticket-05-retired",
        expectedReason: "preparation_not_approved"
      },
      {
        client: householdA.client,
        slug: "ticket-05-unsupported",
        expectedReason: "preparation_not_approved"
      }
    ];

    for (const attempt of attempts) {
      await attempt.prepare?.();
      const before = await householdA.client.rpc("get_current_week");
      const result = await attempt.client.rpc("plan_preparation_for_tomorrow", {
        p_baby_id: babyAId,
        p_preparation_slug: attempt.slug,
        p_meal_slot: "dinner"
      });
      const after = await householdA.client.rpc("get_current_week");

      expect(result.error).toBeNull();
      expect(result.data).toEqual({
        status: "rejected",
        reason: attempt.expectedReason
      });
      expect(after.data).toEqual(before.data);
      await attempt.restore?.();
    }
  });

  test("invalid slots, direct writes, and cross-household reads cannot bypass the command", async () => {
    const before = await householdA.client.rpc("get_current_week");
    const invalidSlot = await householdA.client.rpc(
      "plan_preparation_for_tomorrow",
      {
        p_baby_id: babyAId,
        p_preparation_slug: "ticket-05-preparation-4",
        p_meal_slot: "lunch"
      }
    );
    expect(invalidSlot.data).toEqual({
      status: "rejected",
      reason: "meal_slot_not_configured"
    });

    const directWrite = await householdA.client.from("meal_plans").insert({
      baby_id: babyAId
    });
    expect(directWrite.error?.code).toBe("42501");

    const anonymousRead = await anonymous.from("meal_components").select("*");
    expect(anonymousRead.error?.code).toBe("42501");

    const crossHouseholdRead = await householdB.client
      .from("meal_plans")
      .select("*")
      .eq("baby_id", babyAId);
    expect(crossHouseholdRead.error).toBeNull();
    expect(crossHouseholdRead.data).toEqual([]);

    const ownPlan = await householdB.client.rpc(
      "plan_preparation_for_tomorrow",
      {
        p_baby_id: babyBId,
        p_preparation_slug: "ticket-05-preparation-1",
        p_meal_slot: "breakfast"
      }
    );
    expect(ownPlan.data.status).toBe("planned");

    const after = await householdA.client.rpc("get_current_week");
    expect(after.data).toEqual(before.data);
  });

  test("concurrent restriction and retirement commits are revalidated before attachment", async () => {
    const before = await householdA.client.rpc("get_current_week");

    const restrictionTransaction = await startHeldDatabaseTransaction(`
      select id
      from public.babies
      where id = '${babyAId}'
      for update;

      update public.baby_food_restrictions
      set status = 'temporary_avoidance'
      where baby_id = '${babyAId}'
        and food_id = 'food-ticket-05-4';
      `);
    const restrictedRequest = householdA.client
      .rpc("plan_preparation_for_tomorrow", {
        p_baby_id: babyAId,
        p_preparation_slug: "ticket-05-preparation-4",
        p_meal_slot: "dinner"
      })
      .then((result) => result);
    await waitForBlockedPlannerRequest();
    restrictionTransaction.release();
    const [restricted] = await Promise.all([
      restrictedRequest,
      restrictionTransaction.completed
    ]);

    expect(restricted.error).toBeNull();
    expect(restricted.data).toEqual({
      status: "rejected",
      reason: "food_restricted"
    });

    const restored = await admin
      .from("baby_food_restrictions")
      .update({ status: "no_known_restriction" })
      .eq("baby_id", babyAId)
      .eq("food_id", "food-ticket-05-4");
    expect(restored.error).toBeNull();

    const retirementTransaction = await startHeldDatabaseTransaction(`
      insert into public.content_retirements (revision_id, retired_at, reason)
      values (
        'revision-ticket-05-4',
        '2026-07-27',
        'SYNTHETIC CONCURRENT RETIREMENT'
      );
      `);
    const retiredRequest = householdA.client
      .rpc("plan_preparation_for_tomorrow", {
        p_baby_id: babyAId,
        p_preparation_slug: "ticket-05-preparation-4",
        p_meal_slot: "dinner"
      })
      .then((result) => result);
    await waitForBlockedPlannerRequest();
    retirementTransaction.release();
    const [retired] = await Promise.all([
      retiredRequest,
      retirementTransaction.completed
    ]);

    expect(retired.error).toBeNull();
    expect(retired.data).toEqual({
      status: "rejected",
      reason: "preparation_not_approved"
    });

    const after = await householdA.client.rpc("get_current_week");
    expect(after.data).toEqual(before.data);
  });

  test("tomorrow follows the baby's IANA calendar date across daylight-saving changes", async () => {
    for (const [instant, expected] of [
      ["2026-03-08T05:30:00Z", "2026-03-08"],
      ["2026-03-08T06:30:00Z", "2026-03-09"],
      ["2026-11-01T05:30:00Z", "2026-11-02"],
      ["2026-11-01T07:30:00Z", "2026-11-02"]
    ]) {
      const result = await admin.rpc("tomorrow_in_time_zone", {
        p_instant: instant,
        p_time_zone: "America/Chicago"
      });
      expect(result.error).toBeNull();
      expect(result.data).toBe(expected);
    }
  });

  test("copy rejects a source whose reviewed revision was superseded and the read model requires replacement", async () => {
    const editor = await createTestUser("week-superseded");
    const babyId = await createBaby(
      editor,
      "Superseded revision baby",
      "America/Chicago",
      ["breakfast", "dinner"]
    );
    const configured = await editor.client.rpc("save_feeding_configuration", {
      p_skill_statuses: [
        { skill_id: "skill-ticket-05-observed", status: "observed" }
      ],
      p_restrictions: [1, 2, 3, 5].map((index) => ({
        food_id: `food-ticket-05-${index}`,
        status: "no_known_restriction"
      })),
      p_exposures: [],
      p_new_food_pace: "one_per_week",
      p_preparation_time: "under_30_minutes",
      p_prep_day: null,
      p_quick_backup_food_ids: []
    });
    expect(configured.error).toBeNull();
    const planned = await editor.client.rpc("plan_preparation_for_tomorrow", {
      p_baby_id: babyId,
      p_preparation_slug: "ticket-05-preparation-2",
      p_meal_slot: "breakfast"
    });
    expect(planned.error).toBeNull();
    expect(planned.data.status).toBe("planned");

    await runDatabaseCommand(`
      begin;
      insert into public.content_revisions (
        id,
        preparation_id,
        version,
        status,
        method,
        shape_texture,
        source_id,
        reviewer_role,
        reviewed_at,
        approved_at,
        next_review_at
      ) values (
        'revision-ticket-05-2-v2',
        'prep-ticket-05-2',
        2,
        'draft',
        'SYNTHETIC UPDATED TEST METHOD',
        'SYNTHETIC UPDATED TEST TEXTURE',
        'source-ticket-05',
        'synthetic_test_reviewer',
        '2026-07-28',
        '2026-07-28',
        '2027-07-28'
      );
      insert into public.revision_tags (revision_id, tag_id)
      values
        ('revision-ticket-05-2-v2', 'skill-ticket-05-observed'),
        ('revision-ticket-05-2-v2', 'allergen-ticket-05');
      insert into public.storage_rules (
        id,
        revision_id,
        support_status
      ) values (
        'rule-ticket-05-2-v2',
        'revision-ticket-05-2-v2',
        'unsupported'
      );
      update public.content_revisions
      set status = 'approved'
      where id = 'revision-ticket-05-2-v2';
      commit;
    `);

    const before = await editor.client.rpc("get_week_window", {
      p_window_start: null
    });
    expect(before.error).toBeNull();
    const sourceSlot = before.data.days
      .flatMap(
        (day: {
          local_date: string;
          slots: Array<{
            meal_id: string | null;
            meal_slot: string;
            components: Array<{
              component_id: string;
              availability_state: string;
              unavailable_reason: string | null;
            }>;
          }>;
        }) =>
          day.slots.map((slot) => ({
            ...slot,
            localDate: day.local_date
          }))
      )
      .find((slot: { components: Array<{ component_id: string }> }) =>
        slot.components.some(
          ({ component_id }) => component_id === planned.data.component_id
        )
      );
    expect(sourceSlot?.components[0]).toEqual(
      expect.objectContaining({
        availability_state: "replacement_required",
        unavailable_reason: "preparation_not_approved"
      })
    );

    const targetDate = new Date(`${sourceSlot!.localDate}T00:00:00Z`);
    targetDate.setUTCDate(targetDate.getUTCDate() + 1);
    const copied = await editor.client.rpc("edit_manual_week", {
      p_expected_version: before.data.version,
      p_operation: "copy_meal",
      p_payload: {
        source_meal_id: sourceSlot!.meal_id,
        target_local_date: targetDate.toISOString().slice(0, 10),
        target_meal_slot: "dinner"
      },
      p_idempotency_key: crypto.randomUUID()
    });
    expect(copied.error).toBeNull();
    expect(copied.data).toEqual({
      status: "rejected",
      reason: "source_preparation_changed",
      version: before.data.version
    });
    const after = await editor.client.rpc("get_week_window", {
      p_window_start: before.data.window_start
    });
    expect(after.error).toBeNull();
    expect(after.data).toEqual(before.data);

    await runDatabaseCommand(`
      insert into public.content_retirements (
        revision_id,
        retired_at,
        reason
      ) values (
        'revision-ticket-05-2-v2',
        '2026-07-28',
        'SYNTHETIC TEST FIXTURE CLEANUP'
      );
    `);
  });
});
