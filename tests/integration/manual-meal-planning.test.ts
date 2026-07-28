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
      p_quick_backup_food_ids: []
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
});
