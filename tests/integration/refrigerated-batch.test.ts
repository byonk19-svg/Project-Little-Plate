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

async function waitForBlockedReactionRequest(): Promise<void> {
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
          and query like '%report_food_reaction%'
          and cardinality(pg_blocking_pids(pid)) > 0`
    ]);

    if (Number(stdout.trim()) > 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error("Timed out waiting for the reaction RPC to block");
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
      },
      {
        id: "food-ticket-10-informational",
        slug: "ticket-10-informational-food",
        name: "Ticket 10 Informational Food",
        category: "synthetic-test-fixture"
      },
      {
        id: "food-ticket-10-quality-thawed-clock",
        slug: "ticket-10-quality-thawed-clock-food",
        name: "Ticket 10 Quality Thawed Clock Food",
        category: "synthetic-test-fixture"
      },
      {
        id: "food-ticket-12",
        slug: "ticket-12-food",
        name: "Ticket 12 Grocery Food",
        category: "Synthetic store section"
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
      },
      {
        id: "prep-ticket-10-informational",
        food_id: "food-ticket-10-informational",
        slug: "ticket-10-informational-preparation",
        name: "Ticket 10 Informational Preparation",
        is_active: true
      },
      {
        id: "prep-ticket-10-quality-thawed-clock",
        food_id: "food-ticket-10-quality-thawed-clock",
        slug: "ticket-10-quality-thawed-clock-preparation",
        name: "Ticket 10 Quality Thawed Clock Preparation",
        is_active: true
      },
      {
        id: "prep-ticket-12",
        food_id: "food-ticket-12",
        slug: "ticket-12-preparation",
        name: "Ticket 12 Preparation",
        is_active: true
      }
    ],
    revisions: [
      {
        id: "revision-ticket-12-retired",
        preparation_id: "prep-ticket-12",
        version: 1,
        status: "approved",
        method: "SYNTHETIC RETIRED TICKET 12 METHOD",
        shape_texture: "SYNTHETIC RETIRED TICKET 12 TEXTURE",
        source_id: "source-ticket-06",
        reviewer_role: "synthetic_test_reviewer",
        reviewed_at: "2026-07-27",
        approved_at: "2026-07-27",
        next_review_at: "2027-07-27",
        tag_ids: ["skill-ticket-06", "allergen-ticket-06"],
        storage_rules: [
          {
            id: "rule-ticket-12-retired",
            support_status: "supported",
            deadline_kind: "discard_after",
            duration_hours: 720,
            guidance: "SYNTHETIC RETIRED TICKET 12 STORAGE GUIDANCE"
          }
        ]
      },
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
      },
      {
        id: "revision-ticket-10-informational",
        preparation_id: "prep-ticket-10-informational",
        version: 1,
        status: "approved",
        method: "SYNTHETIC INFORMATIONAL METHOD",
        shape_texture: "SYNTHETIC INFORMATIONAL TEXTURE",
        source_id: "source-ticket-06",
        reviewer_role: "synthetic_test_reviewer",
        reviewed_at: "2026-07-28",
        approved_at: "2026-07-28",
        next_review_at: "2027-07-28",
        tag_ids: ["skill-ticket-06", "allergen-ticket-06"],
        storage_rules: [
          {
            id: "rule-ticket-10-informational",
            support_status: "supported",
            deadline_kind: "discard_after",
            duration_hours: 24,
            guidance: "SYNTHETIC INFORMATIONAL REFRIGERATOR GUIDANCE"
          }
        ]
      },
      {
        id: "revision-ticket-10-quality-thawed-clock",
        preparation_id: "prep-ticket-10-quality-thawed-clock",
        version: 1,
        status: "approved",
        method: "SYNTHETIC QUALITY THAWED CLOCK METHOD",
        shape_texture: "SYNTHETIC QUALITY THAWED CLOCK TEXTURE",
        source_id: "source-ticket-06",
        reviewer_role: "synthetic_test_reviewer",
        reviewed_at: "2026-07-28",
        approved_at: "2026-07-28",
        next_review_at: "2027-07-28",
        tag_ids: ["skill-ticket-06", "allergen-ticket-06"],
        storage_rules: [
          {
            id: "rule-ticket-10-quality-thawed-clock",
            support_status: "supported",
            deadline_kind: "discard_after",
            duration_hours: 24,
            guidance: "SYNTHETIC QUALITY CLOCK REFRIGERATOR GUIDANCE"
          }
        ]
      },
      {
        id: "revision-ticket-12",
        preparation_id: "prep-ticket-12",
        version: 2,
        status: "approved",
        method: "SYNTHETIC TICKET 12 METHOD",
        shape_texture: "SYNTHETIC TICKET 12 TEXTURE",
        source_id: "source-ticket-06",
        reviewer_role: "synthetic_test_reviewer",
        reviewed_at: "2026-07-28",
        approved_at: "2026-07-28",
        next_review_at: "2027-07-28",
        tag_ids: ["skill-ticket-06", "allergen-ticket-06"],
        storage_rules: [
          {
            id: "rule-ticket-12",
            support_status: "supported",
            deadline_kind: "discard_after",
            duration_hours: 24,
            guidance: "SYNTHETIC TICKET 12 STORAGE GUIDANCE"
          }
        ]
      }
    ],
    retirements: [
      {
        revision_id: "revision-ticket-12-retired",
        retired_at: "2026-07-28",
        reason: "SYNTHETIC SUPERSEDED REVISION"
      }
    ]
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
  let secondServedMealComponentId: string;
  let unsupportedMealComponentId: string;
  let deadlineRaceComponentId: string;
  let crossBatchComponentId: string;
  let rollbackComponentId: string;
  let informationalComponentId: string;
  let qualityThawedClockComponentId: string;
  let ticketTwelveComponentIds: string[];
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
          id: "rule-profile-ticket-12-retired",
          storage_rule_id: "rule-ticket-12-retired",
          content_revision_id: "revision-ticket-12-retired",
          storage_location: "refrigerator",
          start_event_kind: "prepared_or_opened",
          precedence: 0,
          duration_min_hours: 720,
          duration_max_hours: 720,
          source_id: "source-ticket-06",
          reviewer_role: "synthetic_test_reviewer",
          reviewed_at: "2026-07-27",
          approved_at: "2026-07-27",
          next_review_at: "2027-07-27"
        },
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
        },
        {
          id: "rule-profile-ticket-10-informational",
          storage_rule_id: "rule-ticket-10-informational",
          content_revision_id: "revision-ticket-10-informational",
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
        },
        {
          id: "rule-profile-ticket-10-quality-thawed-clock",
          storage_rule_id: "rule-ticket-10-quality-thawed-clock",
          content_revision_id: "revision-ticket-10-quality-thawed-clock",
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
        },
        {
          id: "rule-profile-ticket-12",
          storage_rule_id: "rule-ticket-12",
          content_revision_id: "revision-ticket-12",
          storage_location: "refrigerator",
          start_event_kind: "prepared_or_opened",
          precedence: 0,
          duration_min_hours: 24,
          duration_max_hours: 24,
          source_id: "source-ticket-06",
          reviewer_role: "synthetic_test_reviewer",
          reviewed_at: "2026-07-28",
          approved_at: "2026-07-28",
          next_review_at: "2027-07-28"
        }
      ]
    });
    expect(profileImported.error).toBeNull();

    const transitionsImported = await admin.rpc(
      "import_storage_transition_rules",
      {
        p_rules: [
          {
            id: "transition-ticket-12-freeze",
            content_revision_id: "revision-ticket-12",
            transition_kind: "freeze",
            from_state: "refrigerated",
            to_state: "frozen",
            deadline_kind: "quality_by",
            duration_min_hours: 720,
            duration_max_hours: 720,
            clock_start_event: null,
            resets_prior_clock: false,
            method: null,
            refreezing_policy: null,
            return_policy: null,
            guidance: "SYNTHETIC TICKET 12 FREEZER QUALITY GUIDANCE",
            source_id: "source-ticket-06",
            reviewer_role: "synthetic_test_reviewer",
            reviewed_at: "2026-07-28",
            approved_at: "2026-07-28",
            next_review_at: "2027-07-28"
          },
          {
            id: "transition-ticket-10-freeze",
            content_revision_id: "revision-ticket-06",
            transition_kind: "freeze",
            from_state: "refrigerated",
            to_state: "frozen",
            deadline_kind: "quality_by",
            duration_min_hours: 720,
            duration_max_hours: 720,
            clock_start_event: null,
            resets_prior_clock: false,
            method: null,
            refreezing_policy: null,
            return_policy: null,
            guidance: "SYNTHETIC REVIEWED FREEZER QUALITY GUIDANCE",
            source_id: "source-ticket-06",
            reviewer_role: "synthetic_test_reviewer",
            reviewed_at: "2026-07-28",
            approved_at: "2026-07-28",
            next_review_at: "2027-07-28"
          },
          {
            id: "transition-ticket-10-thaw",
            content_revision_id: "revision-ticket-06",
            transition_kind: "begin_thaw",
            from_state: "frozen",
            to_state: "thawing",
            deadline_kind: "discard_after",
            duration_min_hours: 12,
            duration_max_hours: 18,
            clock_start_event: "thaw_started",
            resets_prior_clock: false,
            method: "SYNTHETIC REVIEWED THAW METHOD",
            refreezing_policy: "prohibited",
            return_policy: null,
            guidance: "SYNTHETIC REVIEWED POST-THAW GUIDANCE",
            source_id: "source-ticket-06",
            reviewer_role: "synthetic_test_reviewer",
            reviewed_at: "2026-07-28",
            approved_at: "2026-07-28",
            next_review_at: "2027-07-28"
          },
          {
            id: "transition-ticket-10-freeze-informational",
            content_revision_id: "revision-ticket-10-informational",
            transition_kind: "freeze",
            from_state: "refrigerated",
            to_state: "frozen",
            deadline_kind: "informational",
            duration_min_hours: null,
            duration_max_hours: null,
            clock_start_event: null,
            resets_prior_clock: false,
            method: null,
            refreezing_policy: null,
            return_policy: null,
            guidance: "SYNTHETIC REVIEWED INFORMATIONAL FREEZER GUIDANCE",
            source_id: "source-ticket-06",
            reviewer_role: "synthetic_test_reviewer",
            reviewed_at: "2026-07-28",
            approved_at: "2026-07-28",
            next_review_at: "2027-07-28"
          },
          {
            id: "transition-ticket-10-thaw-on-thawed",
            content_revision_id: "revision-ticket-10-informational",
            transition_kind: "begin_thaw",
            from_state: "frozen",
            to_state: "thawing",
            deadline_kind: "discard_after",
            duration_min_hours: 10,
            duration_max_hours: 16,
            clock_start_event: "thawed",
            resets_prior_clock: false,
            method: "SYNTHETIC REVIEWED THAW-TO-CLOCK METHOD",
            refreezing_policy: "prohibited",
            return_policy: null,
            guidance: "SYNTHETIC REVIEWED THAWED-CLOCK GUIDANCE",
            source_id: "source-ticket-06",
            reviewer_role: "synthetic_test_reviewer",
            reviewed_at: "2026-07-28",
            approved_at: "2026-07-28",
            next_review_at: "2027-07-28"
          },
          {
            id: "transition-ticket-10-freeze-quality-thawed-clock",
            content_revision_id: "revision-ticket-10-quality-thawed-clock",
            transition_kind: "freeze",
            from_state: "refrigerated",
            to_state: "frozen",
            deadline_kind: "quality_by",
            duration_min_hours: 720,
            duration_max_hours: 720,
            clock_start_event: null,
            resets_prior_clock: false,
            method: null,
            refreezing_policy: null,
            return_policy: null,
            guidance: "SYNTHETIC QUALITY-BY FREEZER GUIDANCE",
            source_id: "source-ticket-06",
            reviewer_role: "synthetic_test_reviewer",
            reviewed_at: "2026-07-28",
            approved_at: "2026-07-28",
            next_review_at: "2027-07-28"
          },
          {
            id: "transition-ticket-10-thaw-quality-thawed-clock",
            content_revision_id: "revision-ticket-10-quality-thawed-clock",
            transition_kind: "begin_thaw",
            from_state: "frozen",
            to_state: "thawing",
            deadline_kind: "discard_after",
            duration_min_hours: 10,
            duration_max_hours: 16,
            clock_start_event: "thawed",
            resets_prior_clock: false,
            method: "SYNTHETIC QUALITY REVIEWED THAW METHOD",
            refreezing_policy: "prohibited",
            return_policy: null,
            guidance: "SYNTHETIC QUALITY REVIEWED THAW GUIDANCE",
            source_id: "source-ticket-06",
            reviewer_role: "synthetic_test_reviewer",
            reviewed_at: "2026-07-28",
            approved_at: "2026-07-28",
            next_review_at: "2027-07-28"
          },
          ...["refrigerated", "thawed"].map((fromState) => ({
            id: `transition-ticket-10-return-${fromState}`,
            content_revision_id: "revision-ticket-06",
            transition_kind: "return_untouched",
            from_state: fromState,
            to_state: fromState,
            deadline_kind: null,
            duration_min_hours: null,
            duration_max_hours: null,
            clock_start_event: null,
            resets_prior_clock: false,
            method: null,
            refreezing_policy: null,
            return_policy: "untouched_separately_stored_only",
            guidance: "SYNTHETIC REVIEWED UNTOUCHED RETURN GUIDANCE",
            source_id: "source-ticket-06",
            reviewer_role: "synthetic_test_reviewer",
            reviewed_at: "2026-07-28",
            approved_at: "2026-07-28",
            next_review_at: "2027-07-28"
          }))
        ]
      }
    );
    expect(transitionsImported.error).toBeNull();
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
        },
        {
          food_id: "food-ticket-10-informational",
          status: "no_known_restriction"
        },
        {
          food_id: "food-ticket-10-quality-thawed-clock",
          status: "no_known_restriction"
        },
        {
          food_id: "food-ticket-12",
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
        {
          meal_id: mealIdByDate.get(futureDates[0]),
          preparation_id: "prep-ticket-10-informational",
          revision_id: "revision-ticket-10-informational",
          position: 2
        },
        {
          meal_id: mealIdByDate.get(futureDates[0]),
          preparation_id: "prep-ticket-10-quality-thawed-clock",
          revision_id: "revision-ticket-10-quality-thawed-clock",
          position: 3
        },
        ...futureDates.slice(1).map((localDate) => ({
          meal_id: mealIdByDate.get(localDate),
          preparation_id: "prep-ticket-06",
          revision_id: "revision-ticket-06",
          position: 1
        })),
        ...futureDates.slice(1).map((localDate) => ({
          meal_id: mealIdByDate.get(localDate),
          preparation_id: "prep-ticket-12",
          revision_id: "revision-ticket-12",
          position: 2
        }))
      ])
      .select("id, meal_id, preparation_id");
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
    informationalComponentId = futureComponents.data.find(
      ({ preparation_id }) => preparation_id === "prep-ticket-10-informational"
    )!.id;
    qualityThawedClockComponentId = futureComponents.data.find(
      ({ preparation_id }) =>
        preparation_id === "prep-ticket-10-quality-thawed-clock"
    )!.id;
    deadlineRaceComponentId = componentIdForDate(futureDates[1]);
    crossBatchComponentId = componentIdForDate(futureDates[2]);
    rollbackComponentId = componentIdForDate(futureDates[3]);
    ticketTwelveComponentIds = futureComponents.data
      .filter(({ preparation_id }) => preparation_id === "prep-ticket-12")
      .map(({ id }) => id);
    expect(ticketTwelveComponentIds).toHaveLength(3);
  }, 60_000);

  afterAll(async () => {
    if (userId) {
      expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
    }
    if (fixtureImported && fixtureValidated) {
      const revisionIds = [
        "revision-ticket-06",
        "revision-ticket-06-unsupported",
        "revision-ticket-10-informational",
        "revision-ticket-10-quality-thawed-clock",
        "revision-ticket-12",
        "revision-ticket-12-retired"
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

    const kitchen = await household.rpc("get_kitchen_inventory");
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

    const clientClockInventory = await household.rpc("get_kitchen_inventory", {
      p_reference_at: null
    });
    expect(clientClockInventory.error).not.toBeNull();

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

    const missingClockPolicy = await admin.rpc(
      "import_storage_transition_rules",
      {
        p_rules: [
          {
            id: "transition-ticket-10-missing-clock-policy",
            content_revision_id: "revision-ticket-06",
            transition_kind: "freeze",
            from_state: "refrigerated",
            to_state: "frozen",
            deadline_kind: "quality_by",
            duration_min_hours: 24,
            duration_max_hours: 24,
            clock_start_event: null,
            method: null,
            refreezing_policy: null,
            return_policy: null,
            guidance: "SYNTHETIC INVALID CLOCK POLICY",
            source_id: "source-ticket-06",
            reviewer_role: "synthetic_test_reviewer",
            reviewed_at: "2026-07-28",
            approved_at: "2026-07-28",
            next_review_at: "2027-07-28"
          }
        ]
      }
    );
    expect(missingClockPolicy.error?.message).toContain(
      "Storage transition rule is incomplete or invalid"
    );
    const directMissingClockPolicy = await admin
      .from("storage_transition_rules")
      .insert({
        id: "transition-ticket-10-direct-missing-clock-policy",
        content_revision_id: "revision-ticket-06",
        transition_kind: "freeze",
        from_state: "refrigerated",
        to_state: "frozen",
        deadline_kind: "quality_by",
        duration_min_hours: 24,
        duration_max_hours: 24,
        guidance: "SYNTHETIC INVALID DIRECT CLOCK POLICY",
        source_id: "source-ticket-06",
        reviewer_role: "synthetic_test_reviewer",
        reviewed_at: "2026-07-28",
        approved_at: "2026-07-28",
        next_review_at: "2027-07-28"
      });
    expect(directMissingClockPolicy.error?.message).toContain(
      'null value in column "resets_prior_clock"'
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
          p_baby_id: (await household.rpc("get_kitchen_inventory")).data
            .baby_id,
          p_preparation_slug: "ticket-06-preparation",
          p_meal_slot: "breakfast"
        })
      ).error
    ).toBeNull();

    const laterRead = await household.rpc("get_kitchen_inventory");
    expect(laterRead.error).toBeNull();
    expect(laterRead.data.items[0]).toEqual(
      expect.objectContaining({
        deadline_at: storedDeadline
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

    const stale = await household.rpc("get_kitchen_inventory");
    expect(stale.data.items[0]).toEqual(
      expect.objectContaining({
        remaining_portions: 2,
        projection_matches_ledger: false
      })
    );
    const staleHealth = await household.rpc("get_inventory_health");
    expect(staleHealth.error).toBeNull();
    expect(staleHealth.data.items).toContainEqual(
      expect.objectContaining({
        batch_id: createdBatchId,
        lifecycle_state: "refrigerated",
        remaining_portions: 1,
        ledger_portions: 2,
        projection_matches_ledger: false
      })
    );
    expect(JSON.stringify(staleHealth.data)).not.toMatch(
      /food|birth|allerg|reaction|medical|note|description/i
    );

    const staleHighUpdate = await admin
      .from("batches")
      .update({ remaining_portions: 99 })
      .eq("id", createdBatchId);
    expect(staleHighUpdate.error).toBeNull();
    const staleHigh = await household.rpc("get_kitchen_inventory");
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

    const ready = await household.rpc("get_kitchen_inventory");
    expect(ready.data.items[0]).toEqual(
      expect.objectContaining({
        remaining_portions: 2,
        projection_matches_ledger: true
      })
    );
    const readyHealth = await household.rpc("get_inventory_health");
    expect(readyHealth.data.items).toContainEqual(
      expect.objectContaining({
        batch_id: createdBatchId,
        remaining_portions: 2,
        ledger_portions: 2,
        projection_matches_ledger: true
      })
    );

    const inactiveBabyId = crypto.randomUUID();
    const inactiveBatchId = crypto.randomUUID();
    await runDatabaseCommand(`
      insert into public.babies (
        id, household_id, nickname, birth_date, time_zone,
        feeding_style, meal_slots, is_active
      )
      select
        '${inactiveBabyId}', household_id, 'Synthetic inactive health profile',
        '2025-10-15', 'America/Chicago', 'mixed', array['breakfast'], false
      from public.babies
      where id = '${babyId}';

      insert into public.batches (
        id, baby_id, preparation_id, content_revision_id, storage_location,
        prepared_or_opened_at, initial_portions, remaining_portions,
        idempotency_key, lifecycle_state
      )
      select
        '${inactiveBatchId}', '${inactiveBabyId}', preparation_id,
        content_revision_id, storage_location, prepared_or_opened_at,
        initial_portions, remaining_portions, gen_random_uuid(), lifecycle_state
      from public.batches
      where id = '${createdBatchId}';

      insert into public.batch_events (
        batch_id, event_type, occurred_at, actor_user_id, portion_delta
      )
      select
        '${inactiveBatchId}', event_type, occurred_at, actor_user_id,
        portion_delta
      from public.batch_events
      where batch_id = '${createdBatchId}'
        and event_type = 'prepared_or_opened';
    `);
    const activeOnlyHealth = await household.rpc("get_inventory_health");
    expect(activeOnlyHealth.error).toBeNull();
    expect(activeOnlyHealth.data.items).not.toContainEqual(
      expect.objectContaining({ batch_id: inactiveBatchId })
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
    const crossHouseholdDiscard = await other.rpc("discard_batch", {
      p_batch_id: createdBatchId,
      p_idempotency_key: "12acaebc-cdd9-458c-bd1e-3b3eeb6f6bd4"
    });
    expect(crossHouseholdDiscard.error).toBeNull();
    expect(crossHouseholdDiscard.data).toEqual({
      status: "rejected",
      reason: "batch_unavailable"
    });
    const crossHouseholdTransition = await other.rpc(
      "perform_batch_transition",
      {
        p_batch_id: createdBatchId,
        p_transition: "freeze",
        p_payload: {},
        p_idempotency_key: crypto.randomUUID()
      }
    );
    expect(crossHouseholdTransition.error).toBeNull();
    expect(crossHouseholdTransition.data).toEqual({
      status: "rejected",
      reason: "batch_unavailable"
    });
    expect(
      (
        await other.rpc("project_batch_lifecycle", {
          p_batch_id: createdBatchId
        })
      ).data
    ).toBeNull();

    expect((await other.from("batches").select("*")).data).toEqual([]);
    const anonymous = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    expect(
      (
        await anonymous.rpc("project_batch_lifecycle", {
          p_batch_id: createdBatchId
        })
      ).error
    ).not.toBeNull();
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

  test("a serving command and meal-status edit with the same key serialize without deadlock", async () => {
    const initial = await household.rpc("get_week_window", {
      p_window_start: null
    });
    expect(initial.error).toBeNull();
    const targetDate = initial.data.days[6].local_date as string;
    const added = await household.rpc("edit_manual_week", {
      p_expected_version: initial.data.version,
      p_operation: "add_component",
      p_payload: {
        local_date: targetDate,
        meal_slot: "dinner",
        preparation_slug: "ticket-06-preparation"
      },
      p_idempotency_key: crypto.randomUUID()
    });
    expect(added.error).toBeNull();
    expect(added.data.status).toBe("applied");

    const preparedAt = new Date(Date.now() - 60_000).toISOString();
    const batch = await household.rpc("create_refrigerated_batch", {
      p_meal_component_id: added.data.component_id,
      p_prepared_or_opened_at: preparedAt,
      p_portion_count: 2,
      p_idempotency_key: crypto.randomUUID(),
      p_storage_location: "refrigerator"
    });
    expect(batch.error).toBeNull();
    expect(batch.data.status).toBe("created");

    const sharedKey = "8b9e3116-6697-4574-93e6-66acdb02b99d";
    const [edited, served] = await Promise.all([
      household.rpc("edit_manual_week", {
        p_expected_version: added.data.version,
        p_operation: "set_meal_status",
        p_payload: { meal_id: added.data.meal_id, status: "skipped" },
        p_idempotency_key: sharedKey
      }),
      household.rpc("serve_planned_portion", {
        p_meal_component_id: added.data.component_id,
        p_batch_id: batch.data.batch_id,
        p_idempotency_key: sharedKey
      })
    ]);
    expect(edited.error).toBeNull();
    expect(served.error).toBeNull();
    const editWon = edited.data.status === "applied";
    if (editWon) {
      expect(served.data).toEqual({
        status: "rejected",
        reason: "meal_not_planned"
      });
    } else {
      expect(edited.data).toEqual({
        status: "rejected",
        reason: "meal_already_served",
        version: added.data.version
      });
      expect(served.data.status).toBe("served");
      const completed = await household.rpc("edit_manual_week", {
        p_expected_version: added.data.version,
        p_operation: "set_meal_status",
        p_payload: { meal_id: added.data.meal_id, status: "completed" },
        p_idempotency_key: crypto.randomUUID()
      });
      expect(completed.error).toBeNull();
      expect(completed.data.status).toBe("applied");
    }

    const discarded = await household.rpc("discard_batch", {
      p_batch_id: batch.data.batch_id,
      p_idempotency_key: crypto.randomUUID()
    });
    expect(discarded.error).toBeNull();
    expect(discarded.data.status).toBe("discarded");
  });

  test("skipped meals disappear from Today and cannot consume a prepared portion", async () => {
    const week = await household.rpc("get_week_window", {
      p_window_start: null
    });
    expect(week.error).toBeNull();
    const dinnerSlot = week.data.days
      .flatMap(
        (day: {
          slots: Array<{
            meal_id: string | null;
            meal_slot: string;
            components: Array<{ component_id: string }>;
          }>;
        }) => day.slots
      )
      .find(
        (slot: {
          meal_slot: string;
          components: Array<{ component_id: string }>;
        }) =>
          slot.meal_slot === "dinner" &&
          slot.components.some(
            ({ component_id }) => component_id === dinnerMealComponentId
          )
      );
    expect(dinnerSlot?.meal_id).toBeTruthy();

    const skipped = await household.rpc("edit_manual_week", {
      p_expected_version: week.data.version,
      p_operation: "set_meal_status",
      p_payload: { meal_id: dinnerSlot!.meal_id, status: "skipped" },
      p_idempotency_key: crypto.randomUUID()
    });
    expect(skipped.error).toBeNull();
    expect(skipped.data).toEqual(
      expect.objectContaining({
        status: "applied",
        version: week.data.version + 1
      })
    );

    const serveKey = "57d60fd2-519e-47ca-86f1-b7921db94f00";
    const blocked = await household.rpc("serve_planned_portion", {
      p_meal_component_id: dinnerMealComponentId,
      p_batch_id: createdBatchId,
      p_idempotency_key: serveKey
    });
    expect(blocked.error).toBeNull();
    expect(blocked.data).toEqual({
      status: "rejected",
      reason: "meal_not_planned"
    });
    const blockedEvents = await household
      .from("batch_events")
      .select("id")
      .eq("idempotency_key", serveKey);
    expect(blockedEvents.error).toBeNull();
    expect(blockedEvents.data).toEqual([]);

    const today = await household.rpc("get_today_meal");
    expect(today.error).toBeNull();
    expect(
      today.data.components.some(
        ({ component_id }: { component_id: string }) =>
          component_id === dinnerMealComponentId
      )
    ).toBe(false);

    const reopened = await household.rpc("edit_manual_week", {
      p_expected_version: skipped.data.version,
      p_operation: "set_meal_status",
      p_payload: { meal_id: dinnerSlot!.meal_id, status: "planned" },
      p_idempotency_key: crypto.randomUUID()
    });
    expect(reopened.error).toBeNull();
    expect(reopened.data.status).toBe("applied");
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
    secondServedMealComponentId =
      firstFinalAttempt.data.status === "served"
        ? dinnerMealComponentId
        : lunchMealComponentId;

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

    const kitchen = await household.rpc("get_kitchen_inventory");
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

  test("use-soon inventory is deadline ordered and expired cleanup is append-only and idempotent", async () => {
    const now = Date.now();
    const earlier = await household.rpc("create_refrigerated_batch", {
      p_meal_component_id: deadlineRaceComponentId,
      p_prepared_or_opened_at: new Date(
        now - 22 * 60 * 60 * 1000
      ).toISOString(),
      p_portion_count: 2,
      p_idempotency_key: "495783e5-8854-4b7b-9184-0664aec26547",
      p_storage_location: "refrigerator"
    });
    const later = await household.rpc("create_refrigerated_batch", {
      p_meal_component_id: deadlineRaceComponentId,
      p_prepared_or_opened_at: new Date(
        now - 20 * 60 * 60 * 1000
      ).toISOString(),
      p_portion_count: 1,
      p_idempotency_key: "e7ffb552-1ce0-428d-b701-ec6445e90255",
      p_storage_location: "refrigerator"
    });
    const expired = await household.rpc("create_refrigerated_batch", {
      p_meal_component_id: deadlineRaceComponentId,
      p_prepared_or_opened_at: new Date(
        now - 25 * 60 * 60 * 1000
      ).toISOString(),
      p_portion_count: 2,
      p_idempotency_key: "1db62e2e-2a42-4542-b3b0-3ccb451261e3",
      p_storage_location: "refrigerator"
    });
    expect(earlier.error).toBeNull();
    expect(later.error).toBeNull();
    expect(expired.error).toBeNull();

    const concurrent = await household.rpc("create_refrigerated_batch", {
      p_meal_component_id: deadlineRaceComponentId,
      p_prepared_or_opened_at: new Date(now - 60_000).toISOString(),
      p_portion_count: 2,
      p_idempotency_key: "18f9d19f-cfaa-4fa2-a768-8e6ae47acde1",
      p_storage_location: "refrigerator"
    });
    expect(concurrent.error).toBeNull();

    const concurrentDiscards = await Promise.all([
      household.rpc("discard_batch", {
        p_batch_id: concurrent.data.batch_id,
        p_idempotency_key: "b017a1c6-ea16-47e7-a287-f566a5163af4"
      }),
      household.rpc("discard_batch", {
        p_batch_id: concurrent.data.batch_id,
        p_idempotency_key: "b80222e4-becb-4ee5-a22a-81ed84ca6f62"
      })
    ]);
    expect(concurrentDiscards.every(({ error }) => error === null)).toBe(true);
    expect(
      concurrentDiscards
        .map(({ data }) => data)
        .sort((left, right) => left.status.localeCompare(right.status))
    ).toEqual([
      expect.objectContaining({
        status: "discarded",
        batch_id: concurrent.data.batch_id,
        remaining_portions: 0
      }),
      {
        status: "rejected",
        reason: "batch_already_discarded"
      }
    ]);
    const concurrentEvents = await household
      .from("batch_events")
      .select("portion_delta, resulting_portions")
      .eq("batch_id", concurrent.data.batch_id)
      .eq("event_type", "discarded");
    expect(concurrentEvents.error).toBeNull();
    expect(concurrentEvents.data).toEqual([
      { portion_delta: -2, resulting_portions: 0 }
    ]);

    const useSoon = await household.rpc("get_use_soon_batches");
    expect(useSoon.error).toBeNull();
    expect(useSoon.data.items.length).toBeLessThanOrEqual(3);
    expect(useSoon.data.items.slice(0, 2)).toEqual([
      expect.objectContaining({
        batch_id: earlier.data.batch_id,
        remaining_portions: 2,
        source_url: "https://example.test/ticket-06"
      }),
      expect.objectContaining({
        batch_id: later.data.batch_id,
        remaining_portions: 1
      })
    ]);
    const today = await household.rpc("get_today_meal");
    expect(today.error).toBeNull();
    const todaySelectedComponent = today.data.components.find(
      ({
        availability_state,
        batch_id
      }: {
        availability_state: string;
        batch_id: string | null;
      }) =>
        availability_state === "ready" &&
        useSoon.data.items.some(
          ({ batch_id: useSoonBatchId }: { batch_id: string }) =>
            useSoonBatchId === batch_id
        )
    );
    expect(todaySelectedComponent).toBeDefined();
    const selectedUseSoonBatch = useSoon.data.items.find(
      ({ batch_id }: { batch_id: string }) =>
        batch_id === todaySelectedComponent.batch_id
    );
    expect(selectedUseSoonBatch).toEqual(
      expect.objectContaining({
        next_component_id: todaySelectedComponent.component_id
      })
    );
    expect(
      useSoon.data.items
        .filter(
          ({ batch_id }: { batch_id: string }) =>
            batch_id !== todaySelectedComponent.batch_id
        )
        .every(
          ({ next_component_id }: { next_component_id: string | null }) =>
            next_component_id === null
        )
    ).toBe(true);
    expect(
      useSoon.data.items.some(
        ({ batch_id }: { batch_id: string }) =>
          batch_id === expired.data.batch_id
      )
    ).toBe(false);

    const kitchen = await household.rpc("get_kitchen_inventory");
    expect(kitchen.error).toBeNull();
    const deadlines = kitchen.data.items.map(
      ({ deadline_at }: { deadline_at: string }) =>
        new Date(deadline_at).getTime()
    );
    expect(deadlines).toEqual([...deadlines].sort((a, b) => a - b));
    expect(
      kitchen.data.items.find(
        ({ batch_id }: { batch_id: string }) =>
          batch_id === expired.data.batch_id
      )
    ).toEqual(
      expect.objectContaining({
        storage_status: "expired",
        remaining_portions: 2
      })
    );

    const blockedServe = await household.rpc("serve_planned_portion", {
      p_meal_component_id: deadlineRaceComponentId,
      p_batch_id: expired.data.batch_id,
      p_idempotency_key: "14195833-073b-4837-b6b7-6e879439dcac"
    });
    expect(blockedServe.error).toBeNull();
    expect(blockedServe.data).toEqual({
      status: "rejected",
      reason: "batch_expired"
    });

    const discardKey = "55aba389-4a83-4e35-a96f-c09bcd08e3e6";
    const discarded = await household.rpc("discard_batch", {
      p_batch_id: expired.data.batch_id,
      p_idempotency_key: discardKey
    });
    expect(discarded.error).toBeNull();
    expect(discarded.data).toEqual(
      expect.objectContaining({
        status: "discarded",
        batch_id: expired.data.batch_id,
        remaining_portions: 0,
        idempotent_retry: false
      })
    );
    const retried = await household.rpc("discard_batch", {
      p_batch_id: expired.data.batch_id,
      p_idempotency_key: discardKey
    });
    expect(retried.error).toBeNull();
    expect(retried.data).toEqual({
      ...discarded.data,
      idempotent_retry: true
    });
    const secondKey = await household.rpc("discard_batch", {
      p_batch_id: expired.data.batch_id,
      p_idempotency_key: "efc4321b-2688-4c6d-bc9f-a488100d0d70"
    });
    expect(secondKey.data).toEqual({
      status: "rejected",
      reason: "batch_already_discarded"
    });

    const discardEvents = await household
      .from("batch_events")
      .select("event_type, portion_delta, resulting_portions")
      .eq("batch_id", expired.data.batch_id)
      .eq("event_type", "discarded");
    expect(discardEvents.error).toBeNull();
    expect(discardEvents.data).toEqual([
      {
        event_type: "discarded",
        portion_delta: -2,
        resulting_portions: 0
      }
    ]);
    const afterCleanup = await household.rpc("get_kitchen_inventory");
    expect(
      afterCleanup.data.items.some(
        ({ batch_id }: { batch_id: string }) =>
          batch_id === expired.data.batch_id
      )
    ).toBe(false);

    const anonymous = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    expect((await anonymous.rpc("get_use_soon_batches")).error).not.toBeNull();
    expect(
      (
        await household.from("batch_events").insert({
          batch_id: later.data.batch_id,
          event_type: "discarded",
          occurred_at: new Date().toISOString(),
          actor_user_id: userId,
          portion_delta: -1,
          idempotency_key: "19bc03af-c560-432b-8c54-9b0d014603dd",
          resulting_portions: 0
        })
      ).error
    ).not.toBeNull();
  });

  test("reviewed freezer, thaw, untouched return, correction, finish, and reconciliation remain append-only", async () => {
    const expiringCreated = await household.rpc("create_refrigerated_batch", {
      p_meal_component_id: rollbackComponentId,
      p_prepared_or_opened_at: new Date(
        Date.now() - 24 * 60 * 60 * 1000 + 8_000
      ).toISOString(),
      p_portion_count: 2,
      p_idempotency_key: crypto.randomUUID(),
      p_storage_location: "refrigerator"
    });
    expect(expiringCreated.error).toBeNull();
    const expiringFrozen = await household.rpc("perform_batch_transition", {
      p_batch_id: expiringCreated.data.batch_id,
      p_transition: "freeze",
      p_payload: {},
      p_idempotency_key: crypto.randomUUID()
    });
    expect(expiringFrozen.error).toBeNull();
    const frozenInventoryRead = await household.rpc("get_kitchen_inventory");
    const expiringInventory = frozenInventoryRead.data.items.find(
      ({ batch_id }: { batch_id: string }) =>
        batch_id === expiringCreated.data.batch_id
    );
    expect(expiringInventory).toEqual(
      expect.objectContaining({
        deadline_kind: "discard_after",
        deadline_at: expiringCreated.data.deadline_at,
        original_deadline_at: expiringCreated.data.deadline_at
      })
    );
    expect(new Date(expiringInventory.quality_by_at).getTime()).toBeGreaterThan(
      new Date(expiringInventory.deadline_at).getTime()
    );

    const thawingCreated = await household.rpc("create_refrigerated_batch", {
      p_meal_component_id: rollbackComponentId,
      p_prepared_or_opened_at: new Date(
        Date.now() - 24 * 60 * 60 * 1000 + 8_000
      ).toISOString(),
      p_portion_count: 2,
      p_idempotency_key: crypto.randomUUID(),
      p_storage_location: "refrigerator"
    });
    expect(thawingCreated.error).toBeNull();
    expect(
      (
        await household.rpc("perform_batch_transition", {
          p_batch_id: thawingCreated.data.batch_id,
          p_transition: "freeze",
          p_payload: {},
          p_idempotency_key: crypto.randomUUID()
        })
      ).error
    ).toBeNull();
    const startedBeforeExpiry = await household.rpc(
      "perform_batch_transition",
      {
        p_batch_id: thawingCreated.data.batch_id,
        p_transition: "begin_thaw",
        p_payload: {},
        p_idempotency_key: crypto.randomUUID()
      }
    );
    expect(startedBeforeExpiry.error).toBeNull();
    expect(startedBeforeExpiry.data.lifecycle_state).toBe("thawing");

    const waitUntilExpired =
      Math.max(
        new Date(expiringCreated.data.deadline_at).getTime(),
        new Date(thawingCreated.data.deadline_at).getTime()
      ) -
      Date.now() +
      250;
    if (waitUntilExpired > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitUntilExpired));
    }
    const expiredThaw = await household.rpc("perform_batch_transition", {
      p_batch_id: expiringCreated.data.batch_id,
      p_transition: "begin_thaw",
      p_payload: {},
      p_idempotency_key: crypto.randomUUID()
    });
    expect(expiredThaw.error).toBeNull();
    expect(expiredThaw.data).toEqual({
      status: "rejected",
      reason: "batch_expired"
    });
    const expiredMarkThawed = await household.rpc("perform_batch_transition", {
      p_batch_id: thawingCreated.data.batch_id,
      p_transition: "mark_thawed",
      p_payload: {},
      p_idempotency_key: crypto.randomUUID()
    });
    expect(expiredMarkThawed.error).toBeNull();
    expect(expiredMarkThawed.data).toEqual({
      status: "rejected",
      reason: "batch_expired"
    });
    const afterExpiry = await household.rpc("get_kitchen_inventory");
    expect(
      afterExpiry.data.items.find(
        ({ batch_id }: { batch_id: string }) =>
          batch_id === thawingCreated.data.batch_id
      )
    ).toEqual(
      expect.objectContaining({
        storage_status: "expired",
        available_actions: ["finish", "correct", "discard"],
        action_guidance: null
      })
    );

    const created = await household.rpc("create_refrigerated_batch", {
      p_meal_component_id: rollbackComponentId,
      p_prepared_or_opened_at: new Date(Date.now() - 60_000).toISOString(),
      p_portion_count: 2,
      p_idempotency_key: "c5ad04ae-9f34-4c0a-a6a7-606419a9ec0b",
      p_storage_location: "refrigerator"
    });
    expect(created.error).toBeNull();
    expect(created.data.status).toBe("created");

    const invalidThaw = await household.rpc("perform_batch_transition", {
      p_batch_id: created.data.batch_id,
      p_transition: "begin_thaw",
      p_payload: {},
      p_idempotency_key: crypto.randomUUID()
    });
    expect(invalidThaw.error).toBeNull();
    expect(invalidThaw.data).toEqual({
      status: "rejected",
      reason: "invalid_batch_transition"
    });

    const freezeKeys = [
      "14453061-88bb-46d2-8a46-1584598aa567",
      "24453061-88bb-46d2-8a46-1584598aa567"
    ];
    const concurrentFreeze = await Promise.all(
      freezeKeys.map((p_idempotency_key) =>
        household.rpc("perform_batch_transition", {
          p_batch_id: created.data.batch_id,
          p_transition: "freeze",
          p_payload: {},
          p_idempotency_key
        })
      )
    );
    expect(concurrentFreeze.every(({ error }) => error === null)).toBe(true);
    const appliedFreeze = concurrentFreeze.find(
      ({ data }) => data.status === "applied"
    )!;
    const rejectedFreeze = concurrentFreeze.find(
      ({ data }) => data.status === "rejected"
    )!;
    expect(appliedFreeze.data).toEqual(
      expect.objectContaining({
        status: "applied",
        transition: "freeze",
        lifecycle_state: "frozen",
        remaining_portions: 2,
        idempotent_retry: false
      })
    );
    expect(rejectedFreeze.data).toEqual({
      status: "rejected",
      reason: "invalid_batch_transition"
    });
    const freezeKey =
      concurrentFreeze.indexOf(appliedFreeze) === 0
        ? freezeKeys[0]
        : freezeKeys[1];
    const freezeRetry = await household.rpc("perform_batch_transition", {
      p_batch_id: created.data.batch_id,
      p_transition: "freeze",
      p_payload: {},
      p_idempotency_key: freezeKey
    });
    expect(freezeRetry.error).toBeNull();
    expect(freezeRetry.data).toEqual({
      ...appliedFreeze.data,
      idempotent_retry: true
    });
    const freezeEvents = await household
      .from("batch_events")
      .select("id")
      .eq("batch_id", created.data.batch_id)
      .eq("event_type", "frozen");
    expect(freezeEvents.error).toBeNull();
    expect(freezeEvents.data).toHaveLength(1);

    const frozenDeadline = await household
      .from("batch_lifecycle_deadlines")
      .select(
        "deadline_kind, applied_duration_hours, reviewed_duration_min_hours, reviewed_duration_max_hours"
      )
      .eq("batch_id", created.data.batch_id)
      .single();
    expect(frozenDeadline.error).toBeNull();
    expect(frozenDeadline.data).toEqual({
      deadline_kind: "quality_by",
      applied_duration_hours: 720,
      reviewed_duration_min_hours: 720,
      reviewed_duration_max_hours: 720
    });

    const thawing = await household.rpc("perform_batch_transition", {
      p_batch_id: created.data.batch_id,
      p_transition: "begin_thaw",
      p_payload: {},
      p_idempotency_key: crypto.randomUUID()
    });
    expect(thawing.error).toBeNull();
    expect(thawing.data.lifecycle_state).toBe("thawing");
    const thawed = await household.rpc("perform_batch_transition", {
      p_batch_id: created.data.batch_id,
      p_transition: "mark_thawed",
      p_payload: {},
      p_idempotency_key: crypto.randomUUID()
    });
    expect(thawed.error).toBeNull();
    expect(thawed.data.lifecycle_state).toBe("thawed");

    const deadlines = await household
      .from("batch_lifecycle_deadlines")
      .select(
        "deadline_kind, applied_duration_hours, reviewed_duration_min_hours, reviewed_duration_max_hours"
      )
      .eq("batch_id", created.data.batch_id)
      .order("created_at");
    expect(deadlines.error).toBeNull();
    expect(deadlines.data).toEqual([
      {
        deadline_kind: "quality_by",
        applied_duration_hours: 720,
        reviewed_duration_min_hours: 720,
        reviewed_duration_max_hours: 720
      },
      {
        deadline_kind: "discard_after",
        applied_duration_hours: 12,
        reviewed_duration_min_hours: 12,
        reviewed_duration_max_hours: 18
      }
    ]);

    const preparedEvent = await household
      .from("batch_events")
      .select("id")
      .eq("batch_id", created.data.batch_id)
      .eq("event_type", "prepared_or_opened")
      .single();
    expect(preparedEvent.error).toBeNull();
    const frozenEvent = await household
      .from("batch_events")
      .select("id")
      .eq("batch_id", created.data.batch_id)
      .eq("event_type", "frozen")
      .single();
    expect(frozenEvent.error).toBeNull();
    const invalidCorrection = await household.rpc("perform_batch_transition", {
      p_batch_id: created.data.batch_id,
      p_transition: "correct",
      p_payload: {
        target_remaining_portions: 1,
        corrects_event_id: frozenEvent.data!.id,
        reason: "inventory_overcount"
      },
      p_idempotency_key: crypto.randomUUID()
    });
    expect(invalidCorrection.error).toBeNull();
    expect(invalidCorrection.data).toEqual({
      status: "rejected",
      reason: "invalid_correction"
    });
    const corrected = await household.rpc("perform_batch_transition", {
      p_batch_id: created.data.batch_id,
      p_transition: "correct",
      p_payload: {
        target_remaining_portions: 1,
        corrects_event_id: preparedEvent.data!.id,
        reason: "inventory_overcount"
      },
      p_idempotency_key: crypto.randomUUID()
    });
    expect(corrected.error).toBeNull();
    expect(corrected.data).toEqual(
      expect.objectContaining({
        status: "applied",
        remaining_portions: 1,
        lifecycle_state: "thawed"
      })
    );

    const served = await household.rpc("serve_planned_portion", {
      p_meal_component_id: rollbackComponentId,
      p_batch_id: created.data.batch_id,
      p_idempotency_key: crypto.randomUUID()
    });
    expect(served.error).toBeNull();
    expect(served.data.status).toBe("served");

    const salivaReturn = await household.rpc("perform_batch_transition", {
      p_batch_id: created.data.batch_id,
      p_transition: "return_untouched",
      p_payload: {
        served_event_id: served.data.event_id,
        exposure_state: "saliva_exposed"
      },
      p_idempotency_key: crypto.randomUUID()
    });
    expect(salivaReturn.error).toBeNull();
    expect(salivaReturn.data).toEqual({
      status: "rejected",
      reason: "portion_not_returnable"
    });

    const returned = await household.rpc("perform_batch_transition", {
      p_batch_id: created.data.batch_id,
      p_transition: "return_untouched",
      p_payload: {
        served_event_id: served.data.event_id,
        exposure_state: "untouched_separately_stored"
      },
      p_idempotency_key: crypto.randomUUID()
    });
    expect(returned.error).toBeNull();
    expect(returned.data).toEqual(
      expect.objectContaining({
        status: "applied",
        remaining_portions: 1,
        lifecycle_state: "thawed"
      })
    );

    const finished = await household.rpc("perform_batch_transition", {
      p_batch_id: created.data.batch_id,
      p_transition: "finish",
      p_payload: {},
      p_idempotency_key: crypto.randomUUID()
    });
    expect(finished.error).toBeNull();
    expect(finished.data).toEqual(
      expect.objectContaining({
        status: "applied",
        remaining_portions: 0,
        lifecycle_state: "finished"
      })
    );

    const projection = await household.rpc("project_batch_lifecycle", {
      p_batch_id: created.data.batch_id
    });
    expect(projection.error).toBeNull();
    expect(projection.data).toEqual(
      expect.objectContaining({
        cached_remaining_portions: 0,
        ledger_remaining_portions: 0,
        projection_matches_ledger: true,
        lifecycle_state: "finished",
        latest_event_state: "finished"
      })
    );

    const events = await household
      .from("batch_events")
      .select(
        "event_type, occurred_at, actor_user_id, portion_delta, resulting_portions, transition_rule_id, compensates_event_id, metadata"
      )
      .eq("batch_id", created.data.batch_id)
      .order("occurred_at");
    expect(events.error).toBeNull();
    expect(events.data?.map(({ event_type }) => event_type)).toEqual([
      "prepared_or_opened",
      "frozen",
      "thaw_started",
      "thawed",
      "corrected",
      "served",
      "returned_untouched",
      "finished"
    ]);
    expect(
      events.data
        ?.slice(1)
        .every(
          ({ occurred_at, actor_user_id, resulting_portions }) =>
            typeof occurred_at === "string" &&
            actor_user_id === userId &&
            typeof resulting_portions === "number"
        )
    ).toBe(true);
    expect(
      events.data?.find(({ event_type }) => event_type === "corrected")
        ?.compensates_event_id
    ).toBe(preparedEvent.data!.id);
    expect(
      events.data?.find(({ event_type }) => event_type === "returned_untouched")
        ?.metadata
    ).toEqual(
      expect.objectContaining({
        exposure_state: "untouched_separately_stored",
        served_event_id: served.data.event_id
      })
    );
  });

  test("informational freezer guidance preserves the original discard deadline without inventing a quality date", async () => {
    const created = await household.rpc("create_refrigerated_batch", {
      p_meal_component_id: informationalComponentId,
      p_prepared_or_opened_at: new Date(Date.now() - 60_000).toISOString(),
      p_portion_count: 2,
      p_idempotency_key: crypto.randomUUID(),
      p_storage_location: "refrigerator"
    });
    expect(created.error).toBeNull();
    expect(created.data.status).toBe("created");

    const frozen = await household.rpc("perform_batch_transition", {
      p_batch_id: created.data.batch_id,
      p_transition: "freeze",
      p_payload: {},
      p_idempotency_key: crypto.randomUUID()
    });
    expect(frozen.error).toBeNull();
    expect(frozen.data.lifecycle_state).toBe("frozen");

    const inventory = await household.rpc("get_kitchen_inventory");
    expect(inventory.error).toBeNull();
    expect(
      inventory.data.items.find(
        ({ batch_id }: { batch_id: string }) =>
          batch_id === created.data.batch_id
      )
    ).toEqual(
      expect.objectContaining({
        lifecycle_state: "frozen",
        deadline_kind: "discard_after",
        deadline_at: created.data.deadline_at,
        original_deadline_at: created.data.deadline_at,
        quality_by_at: null,
        applied_duration_hours: null,
        reviewed_duration_range_hours: {
          minimum: null,
          maximum: null
        },
        guidance: "SYNTHETIC REVIEWED INFORMATIONAL FREEZER GUIDANCE",
        available_actions: ["begin_thaw", "finish", "correct", "discard"],
        action_method: "SYNTHETIC REVIEWED THAW-TO-CLOCK METHOD",
        action_refreezing_policy: "prohibited"
      })
    );

    const thawing = await household.rpc("perform_batch_transition", {
      p_batch_id: created.data.batch_id,
      p_transition: "begin_thaw",
      p_payload: {},
      p_idempotency_key: crypto.randomUUID()
    });
    expect(thawing.error).toBeNull();
    const whileThawing = await household.rpc("get_kitchen_inventory");
    expect(
      whileThawing.data.items.find(
        ({ batch_id }: { batch_id: string }) =>
          batch_id === created.data.batch_id
      )
    ).toEqual(
      expect.objectContaining({
        lifecycle_state: "thawing",
        transition_method: "SYNTHETIC REVIEWED THAW-TO-CLOCK METHOD",
        refreezing_policy: "prohibited",
        available_actions: ["mark_thawed", "finish", "correct", "discard"]
      })
    );
    expect(
      (
        await household
          .from("batch_lifecycle_deadlines")
          .select("id")
          .eq("batch_id", created.data.batch_id)
      ).data
    ).toHaveLength(1);
    const thawed = await household.rpc("perform_batch_transition", {
      p_batch_id: created.data.batch_id,
      p_transition: "mark_thawed",
      p_payload: {},
      p_idempotency_key: crypto.randomUUID()
    });
    expect(thawed.error).toBeNull();
    const informationalDeadlines = await household
      .from("batch_lifecycle_deadlines")
      .select("deadline_kind, applied_duration_hours")
      .eq("batch_id", created.data.batch_id)
      .order("created_at");
    expect(informationalDeadlines.error).toBeNull();
    expect(informationalDeadlines.data).toEqual([
      { deadline_kind: "informational", applied_duration_hours: null },
      { deadline_kind: "discard_after", applied_duration_hours: 10 }
    ]);

    const qualityClockCreated = await household.rpc(
      "create_refrigerated_batch",
      {
        p_meal_component_id: qualityThawedClockComponentId,
        p_prepared_or_opened_at: new Date(Date.now() - 60_000).toISOString(),
        p_portion_count: 2,
        p_idempotency_key: crypto.randomUUID(),
        p_storage_location: "refrigerator"
      }
    );
    expect(qualityClockCreated.error).toBeNull();
    for (const transition of ["freeze", "begin_thaw"] as const) {
      const result = await household.rpc("perform_batch_transition", {
        p_batch_id: qualityClockCreated.data.batch_id,
        p_transition: transition,
        p_payload: {},
        p_idempotency_key: crypto.randomUUID()
      });
      expect(result.error).toBeNull();
      expect(result.data.status).toBe("applied");
    }
    const qualityClockThawing = await household.rpc("get_kitchen_inventory");
    expect(
      qualityClockThawing.data.items.find(
        ({ batch_id }: { batch_id: string }) =>
          batch_id === qualityClockCreated.data.batch_id
      )
    ).toEqual(
      expect.objectContaining({
        lifecycle_state: "thawing",
        applied_duration_hours: null,
        reviewed_duration_range_hours: { minimum: 10, maximum: 16 },
        guidance: "SYNTHETIC QUALITY REVIEWED THAW GUIDANCE",
        transition_method: "SYNTHETIC QUALITY REVIEWED THAW METHOD"
      })
    );
    expect(
      (
        await household.rpc("perform_batch_transition", {
          p_batch_id: qualityClockCreated.data.batch_id,
          p_transition: "mark_thawed",
          p_payload: {},
          p_idempotency_key: crypto.randomUUID()
        })
      ).error
    ).toBeNull();
    const qualityClockThawed = await household.rpc("get_kitchen_inventory");
    expect(
      qualityClockThawed.data.items.find(
        ({ batch_id }: { batch_id: string }) =>
          batch_id === qualityClockCreated.data.batch_id
      )
    ).toEqual(
      expect.objectContaining({
        lifecycle_state: "thawed",
        applied_duration_hours: 10,
        reviewed_duration_range_hours: { minimum: 10, maximum: 16 }
      })
    );

    const concurrentCreated = await household.rpc("create_refrigerated_batch", {
      p_meal_component_id: informationalComponentId,
      p_prepared_or_opened_at: new Date(Date.now() - 60_000).toISOString(),
      p_portion_count: 2,
      p_idempotency_key: crypto.randomUUID(),
      p_storage_location: "refrigerator"
    });
    expect(concurrentCreated.error).toBeNull();
    expect(
      (
        await household.rpc("perform_batch_transition", {
          p_batch_id: concurrentCreated.data.batch_id,
          p_transition: "freeze",
          p_payload: {},
          p_idempotency_key: crypto.randomUUID()
        })
      ).error
    ).toBeNull();
    const [serveFrozen, finishFrozen] = await Promise.all([
      household.rpc("serve_planned_portion", {
        p_meal_component_id: informationalComponentId,
        p_batch_id: concurrentCreated.data.batch_id,
        p_idempotency_key: crypto.randomUUID()
      }),
      household.rpc("perform_batch_transition", {
        p_batch_id: concurrentCreated.data.batch_id,
        p_transition: "finish",
        p_payload: {},
        p_idempotency_key: crypto.randomUUID()
      })
    ]);
    expect(serveFrozen.error).toBeNull();
    expect(serveFrozen.data).toEqual({
      status: "rejected",
      reason: "batch_not_ready_to_serve"
    });
    expect(finishFrozen.error).toBeNull();
    expect(finishFrozen.data).toEqual(
      expect.objectContaining({
        status: "applied",
        lifecycle_state: "finished",
        remaining_portions: 0
      })
    );
  });

  test("committed plan edits, valid inventory, overrides, and manual groceries derive one synchronized Kitchen plan", async () => {
    const retiredPreparedAt = new Date(Date.now() - 60_000).toISOString();
    const retiredBatch = await admin
      .from("batches")
      .insert({
        baby_id: babyId,
        preparation_id: "prep-ticket-12",
        content_revision_id: "revision-ticket-12-retired",
        storage_location: "refrigerator",
        prepared_or_opened_at: retiredPreparedAt,
        initial_portions: 1,
        remaining_portions: 1,
        idempotency_key: crypto.randomUUID()
      })
      .select("id")
      .single();
    expect(retiredBatch.error).toBeNull();
    const retiredEvent = await admin
      .from("batch_events")
      .insert({
        batch_id: retiredBatch.data!.id,
        event_type: "prepared_or_opened",
        occurred_at: retiredPreparedAt,
        actor_user_id: userId,
        portion_delta: 1
      })
      .select("id")
      .single();
    expect(retiredEvent.error).toBeNull();
    expect(
      (
        await admin.from("batch_deadlines").insert({
          batch_id: retiredBatch.data!.id,
          start_event_id: retiredEvent.data!.id,
          rule_profile_id: "rule-profile-ticket-12-retired",
          storage_rule_id: "rule-ticket-12-retired",
          content_revision_id: "revision-ticket-12-retired",
          deadline_kind: "discard_after",
          applied_duration_hours: 720,
          reviewed_duration_min_hours: 720,
          reviewed_duration_max_hours: 720,
          deadline_at: new Date(Date.now() + 720 * 60 * 60 * 1000).toISOString()
        })
      ).error
    ).toBeNull();

    const initial = await household.rpc("get_derived_work_and_groceries");
    expect(initial.error).toBeNull();
    const initialTask = initial.data.preparation_tasks.find(
      ({ preparation_id }: { preparation_id: string }) =>
        preparation_id === "prep-ticket-12"
    );
    expect(initialTask).toEqual(
      expect.objectContaining({
        preparation_name: "Ticket 12 Preparation",
        needed_portions: 3
      })
    );
    expect(initialTask.supporting_meals).toHaveLength(3);
    expect(
      (
        await admin
          .from("baby_food_restrictions")
          .update({ status: "no_known_restriction" })
          .eq("baby_id", babyId)
          .eq("food_id", "food-ticket-12")
      ).error
    ).toBeNull();
    expect(
      (
        await household.rpc("get_derived_work_and_groceries")
      ).data.preparation_tasks.find(
        ({ preparation_id }: { preparation_id: string }) =>
          preparation_id === "prep-ticket-12"
      ).task_fingerprint
    ).toBe(initialTask.task_fingerprint);
    expect(
      (
        await household.rpc("save_feeding_configuration", {
          p_skill_statuses: [
            { skill_id: "skill-ticket-06", status: "observed" }
          ],
          p_restrictions: [
            {
              food_id: "food-ticket-06",
              status: "no_known_restriction"
            },
            {
              food_id: "food-ticket-06-unsupported",
              status: "no_known_restriction"
            },
            {
              food_id: "food-ticket-10-informational",
              status: "no_known_restriction"
            },
            {
              food_id: "food-ticket-10-quality-thawed-clock",
              status: "no_known_restriction"
            },
            {
              food_id: "food-ticket-12",
              status: "no_known_restriction"
            }
          ],
          p_exposures: [],
          p_new_food_pace: "one_per_week",
          p_preparation_time: "flexible",
          p_prep_day: 3,
          p_quick_backup_food_ids: []
        })
      ).error
    ).toBeNull();
    expect(
      (
        await household.rpc("get_derived_work_and_groceries")
      ).data.preparation_tasks.find(
        ({ preparation_id }: { preparation_id: string }) =>
          preparation_id === "prep-ticket-12"
      ).task_fingerprint
    ).toBe(initialTask.task_fingerprint);
    expect(
      (
        await admin
          .from("baby_food_restrictions")
          .update({ status: "temporary_avoidance" })
          .eq("baby_id", babyId)
          .eq("food_id", "food-ticket-06")
      ).error
    ).toBeNull();
    expect(
      (
        await household.rpc("get_derived_work_and_groceries")
      ).data.preparation_tasks.find(
        ({ preparation_id }: { preparation_id: string }) =>
          preparation_id === "prep-ticket-12"
      ).task_fingerprint
    ).toBe(initialTask.task_fingerprint);
    expect(
      (
        await admin
          .from("baby_food_restrictions")
          .update({ status: "no_known_restriction" })
          .eq("baby_id", babyId)
          .eq("food_id", "food-ticket-06")
      ).error
    ).toBeNull();
    expect(
      initial.data.derived_grocery_items.find(
        ({ food_id }: { food_id: string }) => food_id === "food-ticket-12"
      )
    ).toEqual({
      food_id: "food-ticket-12",
      food_name: "Ticket 12 Grocery Food",
      store_section: "Synthetic store section",
      needed_portions: 3,
      already_have: false,
      is_checked: false
    });

    const manualKey = crypto.randomUUID();
    const addedManual = await household.rpc("mutate_manual_grocery_item", {
      p_operation: "add",
      p_item_id: null,
      p_payload: {
        name: "Synthetic manual grocery",
        store_section: "Manual section",
        quantity: "2"
      },
      p_idempotency_key: manualKey
    });
    expect(addedManual.error).toBeNull();
    expect(addedManual.data).toEqual(
      expect.objectContaining({
        status: "updated",
        operation: "add",
        idempotent_retry: false
      })
    );
    const retriedManual = await household.rpc("mutate_manual_grocery_item", {
      p_operation: "add",
      p_item_id: null,
      p_payload: {
        name: "Synthetic manual grocery",
        store_section: "Manual section",
        quantity: "2"
      },
      p_idempotency_key: manualKey
    });
    expect(retriedManual.error).toBeNull();
    expect(retriedManual.data).toEqual({
      ...addedManual.data,
      idempotent_retry: true
    });
    const manualItemId = addedManual.data.item_id as string;
    const editedManual = await household.rpc("mutate_manual_grocery_item", {
      p_operation: "edit",
      p_item_id: manualItemId,
      p_payload: {
        name: "Edited synthetic grocery",
        store_section: "Edited section",
        quantity: "3"
      },
      p_idempotency_key: crypto.randomUUID()
    });
    expect(editedManual.error).toBeNull();
    expect(
      (
        await household.rpc("mutate_manual_grocery_item", {
          p_operation: "check",
          p_item_id: manualItemId,
          p_payload: { is_checked: "true" },
          p_idempotency_key: crypto.randomUUID()
        })
      ).error
    ).toBeNull();

    const groceryState = await household.rpc("set_derived_grocery_state", {
      p_food_id: "food-ticket-12",
      p_operation: "set_already_have",
      p_value: true,
      p_idempotency_key: crypto.randomUUID()
    });
    expect(groceryState.error).toBeNull();
    const checkedState = await household.rpc("set_derived_grocery_state", {
      p_food_id: "food-ticket-12",
      p_operation: "set_checked",
      p_value: true,
      p_idempotency_key: crypto.randomUUID()
    });
    expect(checkedState.error).toBeNull();
    const dismissed = await household.rpc("dismiss_preparation_task", {
      p_preparation_id: "prep-ticket-12",
      p_plan_version: initial.data.plan_version,
      p_task_fingerprint: initialTask.task_fingerprint,
      p_idempotency_key: crypto.randomUUID()
    });
    expect(dismissed.error).toBeNull();
    expect(dismissed.data.status).toBe("dismissed");

    const afterOverrides = await household.rpc(
      "get_derived_work_and_groceries"
    );
    expect(afterOverrides.error).toBeNull();
    expect(
      afterOverrides.data.preparation_tasks.some(
        ({ preparation_id }: { preparation_id: string }) =>
          preparation_id === "prep-ticket-12"
      )
    ).toBe(false);
    expect(
      afterOverrides.data.derived_grocery_items.find(
        ({ food_id }: { food_id: string }) => food_id === "food-ticket-12"
      )
    ).toEqual(
      expect.objectContaining({ already_have: true, is_checked: true })
    );
    expect(afterOverrides.data.manual_grocery_items).toEqual([
      expect.objectContaining({
        id: manualItemId,
        name: "Edited synthetic grocery",
        store_section: "Edited section",
        quantity: 3,
        is_checked: true
      })
    ]);
    const directManualWrite = await household
      .from("manual_grocery_items")
      .insert({
        baby_id: babyId,
        name: "Bypass",
        store_section: "Bypass",
        quantity: 1,
        actor_user_id: userId
      });
    expect(directManualWrite.error).not.toBeNull();
    const restrictionIdentityChange = await admin
      .from("baby_food_restrictions")
      .update({ baby_id: crypto.randomUUID() })
      .eq("baby_id", babyId)
      .eq("food_id", "food-ticket-12");
    expect(restrictionIdentityChange.error?.message).toContain(
      "Food restriction identity is immutable"
    );

    const otherEmail = `ticket-12-other-${crypto.randomUUID()}@example.test`;
    const otherPassword = `Ticket-12-${crypto.randomUUID()}`;
    const otherCreated = await admin.auth.admin.createUser({
      email: otherEmail,
      password: otherPassword,
      email_confirm: true
    });
    expect(otherCreated.error).toBeNull();
    const otherAuth = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const otherSignedIn = await otherAuth.auth.signInWithPassword({
      email: otherEmail,
      password: otherPassword
    });
    expect(otherSignedIn.error).toBeNull();
    const other = authenticatedClient(
      status,
      otherSignedIn.data.session!.access_token
    );
    expect((await other.rpc("bootstrap_account")).error).toBeNull();
    expect(
      (
        await other.rpc("complete_baby_profile", {
          p_nickname: "Other derived baby",
          p_birth_date: "2025-10-15",
          p_time_zone: "America/New_York",
          p_feeding_style: "mixed",
          p_meal_slots: ["breakfast"]
        })
      ).error
    ).toBeNull();
    expect((await other.from("manual_grocery_items").select("*")).data).toEqual(
      []
    );
    expect((await other.from("derived_work_events").select("*")).data).toEqual(
      []
    );
    const crossMutation = await other.rpc("mutate_manual_grocery_item", {
      p_operation: "delete",
      p_item_id: manualItemId,
      p_payload: {},
      p_idempotency_key: crypto.randomUUID()
    });
    expect(crossMutation.error).toBeNull();
    expect(crossMutation.data.reason).toBe("manual_grocery_item_unavailable");
    const anonymous = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    expect(
      (await anonymous.rpc("get_derived_work_and_groceries")).error
    ).not.toBeNull();
    expect(
      (await admin.auth.admin.deleteUser(otherCreated.data.user!.id)).error
    ).toBeNull();

    const week = await household.rpc("get_week_window", {
      p_window_start: null
    });
    expect(week.error).toBeNull();
    const swapped = await household.rpc("edit_manual_week", {
      p_expected_version: week.data.version,
      p_operation: "swap_component",
      p_payload: {
        component_id: ticketTwelveComponentIds[0],
        preparation_slug: "ticket-10-informational-preparation"
      },
      p_idempotency_key: crypto.randomUUID()
    });
    expect(swapped.error).toBeNull();
    expect(swapped.data.status).toBe("applied");
    const afterSwap = await household.rpc("get_derived_work_and_groceries");
    const afterSwapTask = afterSwap.data.preparation_tasks.find(
      ({ preparation_id }: { preparation_id: string }) =>
        preparation_id === "prep-ticket-12"
    );
    expect(afterSwapTask).toEqual(
      expect.objectContaining({ needed_portions: 2 })
    );
    expect(
      (
        await household.rpc("dismiss_preparation_task", {
          p_preparation_id: "prep-ticket-12",
          p_plan_version: afterSwap.data.plan_version,
          p_task_fingerprint: afterSwapTask.task_fingerprint,
          p_idempotency_key: crypto.randomUUID()
        })
      ).error
    ).toBeNull();

    const batch = await household.rpc("create_refrigerated_batch", {
      p_meal_component_id: ticketTwelveComponentIds[1],
      p_prepared_or_opened_at: new Date(Date.now() - 60_000).toISOString(),
      p_portion_count: 1,
      p_idempotency_key: crypto.randomUUID(),
      p_storage_location: "refrigerator"
    });
    expect(batch.error).toBeNull();
    expect(batch.data.status).toBe("created");
    const afterInventory = await household.rpc(
      "get_derived_work_and_groceries"
    );
    expect(
      afterInventory.data.preparation_tasks.find(
        ({ preparation_id }: { preparation_id: string }) =>
          preparation_id === "prep-ticket-12"
      )
    ).toEqual(expect.objectContaining({ needed_portions: 2 }));
    expect(
      (
        await household.rpc("perform_batch_transition", {
          p_batch_id: batch.data.batch_id,
          p_transition: "freeze",
          p_payload: {},
          p_idempotency_key: crypto.randomUUID()
        })
      ).error
    ).toBeNull();
    const afterFrozenInventory = await household.rpc(
      "get_derived_work_and_groceries"
    );
    expect(
      afterFrozenInventory.data.preparation_tasks.find(
        ({ preparation_id }: { preparation_id: string }) =>
          preparation_id === "prep-ticket-12"
      )
    ).toEqual(expect.objectContaining({ needed_portions: 2 }));

    const staleEdit = await household.rpc("edit_manual_week", {
      p_expected_version: week.data.version,
      p_operation: "delete_component",
      p_payload: { component_id: ticketTwelveComponentIds[1] },
      p_idempotency_key: crypto.randomUUID()
    });
    expect(staleEdit.error).toBeNull();
    expect(staleEdit.data.reason).toBe("plan_stale");
    expect(
      (await household.rpc("get_derived_work_and_groceries")).data
    ).toEqual(afterFrozenInventory.data);

    const quickBackupAdded = await admin.from("quick_backups").insert({
      baby_id: babyId,
      food_id: "food-ticket-12"
    });
    expect(quickBackupAdded.error).toBeNull();
    expect(
      (
        await household.rpc("set_derived_grocery_state", {
          p_food_id: "food-ticket-12",
          p_operation: "set_already_have",
          p_value: false,
          p_idempotency_key: crypto.randomUUID()
        })
      ).error
    ).toBeNull();
    expect(
      (
        await household.rpc("get_derived_work_and_groceries")
      ).data.derived_grocery_items.some(
        ({ food_id }: { food_id: string }) => food_id === "food-ticket-12"
      )
    ).toBe(true);
    expect(
      (
        await household.rpc("set_derived_grocery_state", {
          p_food_id: "food-ticket-12",
          p_operation: "set_already_have",
          p_value: true,
          p_idempotency_key: crypto.randomUUID()
        })
      ).error
    ).toBeNull();
    expect(
      (
        await household.rpc("get_derived_work_and_groceries")
      ).data.derived_grocery_items.find(
        ({ food_id }: { food_id: string }) => food_id === "food-ticket-12"
      )
    ).toEqual(expect.objectContaining({ already_have: true }));
    expect(
      (
        await admin
          .from("quick_backups")
          .delete()
          .eq("baby_id", babyId)
          .eq("food_id", "food-ticket-12")
      ).error
    ).toBeNull();

    const beforeRestrictionTask = (
      await household.rpc("get_derived_work_and_groceries")
    ).data.preparation_tasks.find(
      ({ preparation_id }: { preparation_id: string }) =>
        preparation_id === "prep-ticket-12"
    );
    const restricted = await admin
      .from("baby_food_restrictions")
      .update({ status: "temporary_avoidance" })
      .eq("baby_id", babyId)
      .eq("food_id", "food-ticket-12");
    expect(restricted.error).toBeNull();
    const whileRestricted = await household.rpc(
      "get_derived_work_and_groceries"
    );
    expect(
      whileRestricted.data.preparation_tasks.some(
        ({ preparation_id }: { preparation_id: string }) =>
          preparation_id === "prep-ticket-12"
      )
    ).toBe(false);
    expect(whileRestricted.data.manual_grocery_items).toHaveLength(1);
    expect(
      (
        await admin
          .from("baby_food_restrictions")
          .update({ status: "no_known_restriction" })
          .eq("baby_id", babyId)
          .eq("food_id", "food-ticket-12")
      ).error
    ).toBeNull();
    const afterRestrictionRoundTrip = await household.rpc(
      "get_derived_work_and_groceries"
    );
    expect(
      afterRestrictionRoundTrip.data.preparation_tasks.find(
        ({ preparation_id }: { preparation_id: string }) =>
          preparation_id === "prep-ticket-12"
      ).task_fingerprint
    ).not.toBe(beforeRestrictionTask.task_fingerprint);

    const finished = await household.rpc("perform_batch_transition", {
      p_batch_id: batch.data.batch_id,
      p_transition: "finish",
      p_payload: {},
      p_idempotency_key: crypto.randomUUID()
    });
    expect(finished.error).toBeNull();
    const afterFinish = await household.rpc("get_derived_work_and_groceries");
    expect(
      afterFinish.data.preparation_tasks.find(
        ({ preparation_id }: { preparation_id: string }) =>
          preparation_id === "prep-ticket-12"
      )
    ).toEqual(expect.objectContaining({ needed_portions: 2 }));

    const currentWeek = await household.rpc("get_week_window", {
      p_window_start: null
    });
    const deleted = await household.rpc("edit_manual_week", {
      p_expected_version: currentWeek.data.version,
      p_operation: "delete_component",
      p_payload: { component_id: ticketTwelveComponentIds[1] },
      p_idempotency_key: crypto.randomUUID()
    });
    expect(deleted.error).toBeNull();
    const afterDelete = await household.rpc("get_derived_work_and_groceries");
    expect(
      afterDelete.data.preparation_tasks.find(
        ({ preparation_id }: { preparation_id: string }) =>
          preparation_id === "prep-ticket-12"
      )
    ).toEqual(expect.objectContaining({ needed_portions: 1 }));

    const trace = afterDelete.data.preparation_tasks.find(
      ({ preparation_id }: { preparation_id: string }) =>
        preparation_id === "prep-ticket-12"
    ).supporting_meals[0];
    const copied = await household.rpc("edit_manual_week", {
      p_expected_version: deleted.data.version,
      p_operation: "copy_meal",
      p_payload: {
        source_meal_id: trace.meal_id,
        target_local_date: trace.local_date,
        target_meal_slot: "lunch"
      },
      p_idempotency_key: crypto.randomUUID()
    });
    expect(copied.error).toBeNull();
    const afterCopy = await household.rpc("get_derived_work_and_groceries");
    expect(
      afterCopy.data.preparation_tasks.find(
        ({ preparation_id }: { preparation_id: string }) =>
          preparation_id === "prep-ticket-12"
      )
    ).toEqual(expect.objectContaining({ needed_portions: 2 }));

    const completed = await household.rpc("edit_manual_week", {
      p_expected_version: copied.data.version,
      p_operation: "set_meal_status",
      p_payload: { meal_id: copied.data.meal_id, status: "completed" },
      p_idempotency_key: crypto.randomUUID()
    });
    expect(completed.error).toBeNull();
    expect(
      (
        await household.rpc("get_derived_work_and_groceries")
      ).data.preparation_tasks.find(
        ({ preparation_id }: { preparation_id: string }) =>
          preparation_id === "prep-ticket-12"
      )
    ).toEqual(expect.objectContaining({ needed_portions: 1 }));

    const deletedManual = await household.rpc("mutate_manual_grocery_item", {
      p_operation: "delete",
      p_item_id: manualItemId,
      p_payload: {},
      p_idempotency_key: crypto.randomUUID()
    });
    expect(deletedManual.error).toBeNull();
    expect(
      (await household.rpc("get_derived_work_and_groceries")).data
        .manual_grocery_items
    ).toEqual([]);
  });

  test("a reviewed reaction report immediately blocks every planning and serving seam until explicitly resolved", async () => {
    const importedGuidance = await admin.rpc(
      "import_reaction_guidance_fixture",
      {
        p_records: [
          {
            id: "reaction-guidance-ticket-11",
            guidance_key: "post-serve-reaction-care-direction",
            version: 1,
            status: "approved",
            guidance:
              "SYNTHETIC REVIEWED REACTION CARE DIRECTION FOR TESTING ONLY",
            source_id: "source-ticket-06",
            reviewer_role: "synthetic_test_reviewer",
            reviewed_at: "2026-07-28",
            approved_at: "2026-07-28",
            next_review_at: "2027-07-28"
          },
          {
            id: "reaction-guidance-unrelated",
            guidance_key: "synthetic-unrelated-direction",
            version: 99,
            status: "approved",
            guidance: "SYNTHETIC UNRELATED GUIDANCE",
            source_id: "source-ticket-06",
            reviewer_role: "synthetic_test_reviewer",
            reviewed_at: "2026-07-28",
            approved_at: "2026-07-28",
            next_review_at: "2027-07-28"
          }
        ]
      }
    );
    expect(importedGuidance.error).toBeNull();

    const servedEvent = await household
      .from("batch_events")
      .select("id, batch_id")
      .eq("meal_component_id", mealComponentId)
      .eq("event_type", "served")
      .single();
    expect(servedEvent.error).toBeNull();

    const context = await household.rpc("get_reaction_report_context", {
      p_served_event_id: servedEvent.data!.id
    });
    expect(context.error).toBeNull();
    expect(context.data).toEqual(
      expect.objectContaining({
        status: "ready",
        food_id: "food-ticket-06",
        food_name: "Ticket 06 Food",
        guidance_revision_id: "reaction-guidance-ticket-11",
        guidance: "SYNTHETIC REVIEWED REACTION CARE DIRECTION FOR TESTING ONLY",
        source_title: "Synthetic Ticket 06 source",
        source_url: "https://example.test/ticket-06",
        reviewed_at: "2026-07-28"
      })
    );

    const readyBeforeReport = await household.rpc("create_refrigerated_batch", {
      p_meal_component_id: unservedMealComponentId,
      p_prepared_or_opened_at: new Date(Date.now() - 60_000).toISOString(),
      p_portion_count: 1,
      p_idempotency_key: crypto.randomUUID(),
      p_storage_location: "refrigerator"
    });
    expect(readyBeforeReport.error).toBeNull();
    expect(readyBeforeReport.data.status).toBe("created");

    const unrelatedGuidance = await household.rpc("report_food_reaction", {
      p_served_event_id: servedEvent.data!.id,
      p_guidance_revision_id: "reaction-guidance-unrelated",
      p_preference: "disliked",
      p_private_description: "SYNTHETIC PRIVATE REACTION DESCRIPTION",
      p_idempotency_key: crypto.randomUUID()
    });
    expect(unrelatedGuidance.error).toBeNull();
    expect(unrelatedGuidance.data).toEqual({
      status: "rejected",
      reason: "reviewed_guidance_unavailable"
    });

    const importedNextGuidance = await admin.rpc(
      "import_reaction_guidance_fixture",
      {
        p_records: [
          {
            id: "reaction-guidance-ticket-11-v2",
            guidance_key: "post-serve-reaction-care-direction",
            version: 2,
            status: "approved",
            guidance: "SYNTHETIC REVIEWED REACTION DIRECTION VERSION TWO",
            source_id: "source-ticket-06",
            reviewer_role: "synthetic_test_reviewer",
            reviewed_at: "2026-07-28",
            approved_at: "2026-07-28",
            next_review_at: "2027-07-28"
          }
        ]
      }
    );
    expect(importedNextGuidance.error).toBeNull();

    const staleGuidance = await household.rpc("report_food_reaction", {
      p_served_event_id: servedEvent.data!.id,
      p_guidance_revision_id: "reaction-guidance-ticket-11",
      p_preference: "disliked",
      p_private_description: "SYNTHETIC PRIVATE REACTION DESCRIPTION",
      p_idempotency_key: crypto.randomUUID()
    });
    expect(staleGuidance.error).toBeNull();
    expect(staleGuidance.data).toEqual({
      status: "rejected",
      reason: "reviewed_guidance_unavailable"
    });

    const currentContext = await household.rpc("get_reaction_report_context", {
      p_served_event_id: servedEvent.data!.id
    });
    expect(currentContext.error).toBeNull();
    expect(currentContext.data).toEqual(
      expect.objectContaining({
        status: "ready",
        guidance_revision_id: "reaction-guidance-ticket-11-v2"
      })
    );

    const retirementTransaction = await startHeldDatabaseTransaction(`
      insert into public.reaction_guidance_retirements (
        guidance_revision_id,
        retired_at,
        reason
      ) values (
        'reaction-guidance-ticket-11-v2',
        '2026-07-28',
        'SYNTHETIC CONCURRENT RETIREMENT'
      );
    `);
    const retiringGuidanceRequest = household
      .rpc("report_food_reaction", {
        p_served_event_id: servedEvent.data!.id,
        p_guidance_revision_id: "reaction-guidance-ticket-11-v2",
        p_preference: "disliked",
        p_private_description: "SYNTHETIC PRIVATE REACTION DESCRIPTION",
        p_idempotency_key: crypto.randomUUID()
      })
      .then((result) => result);
    await waitForBlockedReactionRequest();
    retirementTransaction.release();
    const [retiringGuidance] = await Promise.all([
      retiringGuidanceRequest,
      retirementTransaction.completed
    ]);
    expect(retiringGuidance.error).toBeNull();
    expect(retiringGuidance.data).toEqual({
      status: "rejected",
      reason: "reviewed_guidance_unavailable"
    });

    const importedCurrentGuidance = await admin.rpc(
      "import_reaction_guidance_fixture",
      {
        p_records: [
          {
            id: "reaction-guidance-ticket-11-v3",
            guidance_key: "post-serve-reaction-care-direction",
            version: 3,
            status: "approved",
            guidance: "SYNTHETIC REVIEWED REACTION DIRECTION VERSION THREE",
            source_id: "source-ticket-06",
            reviewer_role: "synthetic_test_reviewer",
            reviewed_at: "2026-07-28",
            approved_at: "2026-07-28",
            next_review_at: "2027-07-28"
          }
        ]
      }
    );
    expect(importedCurrentGuidance.error).toBeNull();

    const publicationTransaction = await startHeldDatabaseTransaction(`
      insert into public.reaction_guidance_revisions (
        id,
        guidance_key,
        version,
        status,
        guidance,
        source_id,
        reviewer_role,
        reviewed_at,
        approved_at,
        next_review_at
      ) values (
        'reaction-guidance-ticket-11-v4',
        'post-serve-reaction-care-direction',
        4,
        'approved',
        'SYNTHETIC REVIEWED REACTION DIRECTION VERSION FOUR',
        'source-ticket-06',
        'synthetic_test_reviewer',
        '2026-07-28',
        '2026-07-28',
        '2027-07-28'
      );
    `);
    const publishingGuidanceRequest = household
      .rpc("report_food_reaction", {
        p_served_event_id: servedEvent.data!.id,
        p_guidance_revision_id: "reaction-guidance-ticket-11-v3",
        p_preference: "disliked",
        p_private_description: "SYNTHETIC PRIVATE REACTION DESCRIPTION",
        p_idempotency_key: crypto.randomUUID()
      })
      .then((result) => result);
    await waitForBlockedReactionRequest();
    publicationTransaction.release();
    const [publishingGuidance] = await Promise.all([
      publishingGuidanceRequest,
      publicationTransaction.completed
    ]);
    expect(publishingGuidance.error).toBeNull();
    expect(publishingGuidance.data).toEqual({
      status: "rejected",
      reason: "reviewed_guidance_unavailable"
    });

    const reportKey = crypto.randomUUID();
    const reported = await household.rpc("report_food_reaction", {
      p_served_event_id: servedEvent.data!.id,
      p_guidance_revision_id: "reaction-guidance-ticket-11-v4",
      p_preference: "disliked",
      p_private_description: "SYNTHETIC PRIVATE REACTION DESCRIPTION",
      p_idempotency_key: reportKey
    });
    expect(reported.error).toBeNull();
    expect(reported.data).toEqual(
      expect.objectContaining({
        status: "reported",
        food_id: "food-ticket-06",
        restriction_status: "reaction_reported",
        preference: "disliked",
        idempotent_retry: false
      })
    );

    const retried = await household.rpc("report_food_reaction", {
      p_served_event_id: servedEvent.data!.id,
      p_guidance_revision_id: "reaction-guidance-ticket-11-v4",
      p_preference: "disliked",
      p_private_description: "SYNTHETIC PRIVATE REACTION DESCRIPTION",
      p_idempotency_key: reportKey
    });
    expect(retried.error).toBeNull();
    expect(retried.data).toEqual({
      ...reported.data,
      idempotent_retry: true
    });

    const today = await household.rpc("get_today_meal");
    expect(today.error).toBeNull();
    expect(today.data.components[0]).toEqual(
      expect.objectContaining({
        availability_state: "unavailable",
        unavailable_reason: "food_restricted"
      })
    );

    const week = await household.rpc("get_week_window", {
      p_window_start: null
    });
    expect(week.error).toBeNull();
    const plannedComponents = week.data.days.flatMap(
      (day: {
        slots: Array<{
          components: Array<{
            availability_state: string;
            unavailable_reason: string | null;
          }>;
        }>;
      }) => day.slots.flatMap((slot) => slot.components)
    );
    expect(
      plannedComponents.some(
        ({
          availability_state,
          unavailable_reason
        }: {
          availability_state: string;
          unavailable_reason: string | null;
        }) =>
          availability_state === "replacement_required" &&
          unavailable_reason === "food_restricted"
      )
    ).toBe(true);

    const editOptions = await household.rpc("get_week_edit_options");
    expect(editOptions.error).toBeNull();
    expect(
      editOptions.data.items.some(
        (item: { preparation_slug: string }) =>
          item.preparation_slug === "ticket-06-preparation"
      )
    ).toBe(false);

    const planningInputs = await household.rpc(
      "get_planning_preparation_inputs"
    );
    expect(planningInputs.error).toBeNull();
    expect(
      planningInputs.data.items.some(
        (item: { preparation_id: string }) =>
          item.preparation_id === "prep-ticket-06"
      )
    ).toBe(false);

    const blockedServe = await household.rpc("serve_planned_portion", {
      p_meal_component_id: unservedMealComponentId,
      p_batch_id: readyBeforeReport.data.batch_id,
      p_idempotency_key: crypto.randomUUID()
    });
    expect(blockedServe.error).toBeNull();
    expect(blockedServe.data).toEqual({
      status: "rejected",
      reason: "food_restricted"
    });

    const blockedBatch = await household.rpc("create_refrigerated_batch", {
      p_meal_component_id: unservedMealComponentId,
      p_prepared_or_opened_at: new Date(Date.now() - 60_000).toISOString(),
      p_portion_count: 1,
      p_idempotency_key: crypto.randomUUID(),
      p_storage_location: "refrigerator"
    });
    expect(blockedBatch.error).toBeNull();
    expect(blockedBatch.data).toEqual({
      status: "rejected",
      reason: "food_restricted"
    });

    const restriction = await household
      .from("baby_food_restrictions")
      .select("status")
      .eq("baby_id", babyId)
      .eq("food_id", "food-ticket-06")
      .single();
    expect(restriction.error).toBeNull();
    expect(restriction.data).toEqual({ status: "reaction_reported" });
    const preference = await household
      .from("baby_food_exposures")
      .select("state")
      .eq("baby_id", babyId)
      .eq("food_id", "food-ticket-06")
      .single();
    expect(preference.error).toBeNull();
    expect(preference.data).toEqual({ state: "disliked" });

    const events = await household
      .from("baby_food_reaction_events")
      .select(
        "event_type, private_description, guidance_revision_id, actor_user_id"
      )
      .eq("baby_id", babyId)
      .eq("food_id", "food-ticket-06");
    expect(events.error).toBeNull();
    expect(events.data).toEqual([
      {
        event_type: "reported",
        private_description: "SYNTHETIC PRIVATE REACTION DESCRIPTION",
        guidance_revision_id: "reaction-guidance-ticket-11-v4",
        actor_user_id: userId
      }
    ]);

    const activeBlocks = await household.rpc("get_active_reaction_blocks");
    expect(activeBlocks.error).toBeNull();
    expect(activeBlocks.data).toEqual({
      status: "ready",
      baby_id: babyId,
      items: [{ food_id: "food-ticket-06", food_name: "Ticket 06 Food" }]
    });

    const mismatchedAuditInsert = await admin
      .from("baby_food_reaction_events")
      .insert({
        baby_id: babyId,
        food_id: "food-ticket-10-informational",
        served_event_id: servedEvent.data!.id,
        event_type: "reported",
        restriction_before: "no_known_restriction",
        restriction_after: "reaction_reported",
        guidance_revision_id: "reaction-guidance-ticket-11-v4",
        actor_user_id: userId,
        idempotency_key: crypto.randomUUID()
      });
    expect(mismatchedAuditInsert.error).not.toBeNull();
    const changedBatchIdentity = await admin
      .from("batches")
      .update({ preparation_id: "prep-ticket-10-informational" })
      .eq("id", servedEvent.data!.batch_id);
    expect(changedBatchIdentity.error).not.toBeNull();

    const otherEmail = `ticket-11-other-${crypto.randomUUID()}@example.test`;
    const otherPassword = `Ticket-11-${crypto.randomUUID()}`;
    const otherCreated = await admin.auth.admin.createUser({
      email: otherEmail,
      password: otherPassword,
      email_confirm: true
    });
    expect(otherCreated.error).toBeNull();
    const otherAuth = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const otherSignedIn = await otherAuth.auth.signInWithPassword({
      email: otherEmail,
      password: otherPassword
    });
    expect(otherSignedIn.error).toBeNull();
    const other = authenticatedClient(
      status,
      otherSignedIn.data.session!.access_token
    );
    expect((await other.rpc("bootstrap_account")).error).toBeNull();
    expect(
      (
        await other.rpc("complete_baby_profile", {
          p_nickname: "Other reaction baby",
          p_birth_date: "2025-10-15",
          p_time_zone: "America/New_York",
          p_feeding_style: "mixed",
          p_meal_slots: ["breakfast"]
        })
      ).error
    ).toBeNull();
    expect(
      (await other.from("baby_food_reaction_events").select("*")).data
    ).toEqual([]);
    expect(
      (
        await other.rpc("get_reaction_report_context", {
          p_served_event_id: servedEvent.data!.id
        })
      ).data
    ).toEqual({
      status: "unavailable",
      reason: "served_event_unavailable"
    });
    expect(
      (
        await other.rpc("report_food_reaction", {
          p_served_event_id: servedEvent.data!.id,
          p_guidance_revision_id: "reaction-guidance-ticket-11-v4",
          p_preference: null,
          p_private_description: null,
          p_idempotency_key: crypto.randomUUID()
        })
      ).data
    ).toEqual({
      status: "rejected",
      reason: "served_event_unavailable"
    });
    const anonymous = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    expect(
      (await anonymous.from("baby_food_reaction_events").select("*")).error
    ).not.toBeNull();
    expect(
      (
        await anonymous.rpc("get_reaction_report_context", {
          p_served_event_id: servedEvent.data!.id
        })
      ).error
    ).not.toBeNull();
    expect(
      (await admin.auth.admin.deleteUser(otherCreated.data.user!.id)).error
    ).toBeNull();

    const resolveKey = crypto.randomUUID();
    const resolved = await household.rpc("resolve_food_reaction", {
      p_food_id: "food-ticket-06",
      p_idempotency_key: resolveKey
    });
    expect(resolved.error).toBeNull();
    expect(resolved.data).toEqual(
      expect.objectContaining({
        status: "resolved",
        food_id: "food-ticket-06",
        restriction_status: "no_known_restriction",
        idempotent_retry: false
      })
    );

    const audit = await household
      .from("baby_food_reaction_events")
      .select("event_type, private_description")
      .eq("baby_id", babyId)
      .eq("food_id", "food-ticket-06")
      .order("occurred_at");
    expect(audit.error).toBeNull();
    expect(audit.data).toEqual([
      {
        event_type: "reported",
        private_description: "SYNTHETIC PRIVATE REACTION DESCRIPTION"
      },
      { event_type: "resolved", private_description: null }
    ]);

    await runDatabaseCommand(`
      update public.babies
      set is_active = false
      where id = '${babyId}';
    `);
    const reportRetryAfterLifecycleChange = await household.rpc(
      "report_food_reaction",
      {
        p_served_event_id: servedEvent.data!.id,
        p_guidance_revision_id: "reaction-guidance-ticket-11-v4",
        p_preference: "disliked",
        p_private_description: "SYNTHETIC PRIVATE REACTION DESCRIPTION",
        p_idempotency_key: reportKey
      }
    );
    expect(reportRetryAfterLifecycleChange.error).toBeNull();
    expect(reportRetryAfterLifecycleChange.data).toEqual({
      ...reported.data,
      idempotent_retry: true
    });
    const resolveRetryAfterLifecycleChange = await household.rpc(
      "resolve_food_reaction",
      {
        p_food_id: "food-ticket-06",
        p_idempotency_key: resolveKey
      }
    );
    expect(resolveRetryAfterLifecycleChange.error).toBeNull();
    expect(resolveRetryAfterLifecycleChange.data).toEqual({
      ...resolved.data,
      idempotent_retry: true
    });
    await runDatabaseCommand(`
      update public.babies
      set is_active = true
      where id = '${babyId}';
    `);

    const movedHouseholdId = crypto.randomUUID();
    await runDatabaseCommand(`
      insert into public.households (id)
      values ('${movedHouseholdId}');

      update public.user_profiles
      set household_id = '${movedHouseholdId}'
      where user_id = '${userId}';
    `);
    const reportRetryAfterHouseholdMove = await household.rpc(
      "report_food_reaction",
      {
        p_served_event_id: servedEvent.data!.id,
        p_guidance_revision_id: "reaction-guidance-ticket-11-v4",
        p_preference: "disliked",
        p_private_description: "SYNTHETIC PRIVATE REACTION DESCRIPTION",
        p_idempotency_key: reportKey
      }
    );
    expect(reportRetryAfterHouseholdMove.error).toBeNull();
    expect(reportRetryAfterHouseholdMove.data).toEqual({
      status: "rejected",
      reason: "idempotency_key_conflict"
    });
    const resolveRetryAfterHouseholdMove = await household.rpc(
      "resolve_food_reaction",
      {
        p_food_id: "food-ticket-06",
        p_idempotency_key: resolveKey
      }
    );
    expect(resolveRetryAfterHouseholdMove.error).toBeNull();
    expect(resolveRetryAfterHouseholdMove.data).toEqual({
      status: "rejected",
      reason: "idempotency_key_conflict"
    });
    await runDatabaseCommand(`
      update public.user_profiles
      set household_id = (
        select household_id
        from public.babies
        where id = '${babyId}'
      )
      where user_id = '${userId}';

      delete from public.households
      where id = '${movedHouseholdId}';
    `);
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

    const cleanupBatch = await household.rpc("create_refrigerated_batch", {
      p_meal_component_id: unservedMealComponentId,
      p_prepared_or_opened_at: new Date(Date.now() - 60_000).toISOString(),
      p_portion_count: 2,
      p_idempotency_key: crypto.randomUUID(),
      p_storage_location: "refrigerator"
    });
    expect(cleanupBatch.error).toBeNull();
    const cleanupFreezeKey = crypto.randomUUID();
    const cleanupFrozen = await household.rpc("perform_batch_transition", {
      p_batch_id: cleanupBatch.data.batch_id,
      p_transition: "freeze",
      p_payload: {},
      p_idempotency_key: cleanupFreezeKey
    });
    expect(cleanupFrozen.error).toBeNull();
    expect(cleanupFrozen.data.status).toBe("applied");

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
    const unpublishedTransitionRequest = household
      .rpc("perform_batch_transition", {
        p_batch_id: recentBatch.data.batch_id,
        p_transition: "freeze",
        p_payload: {},
        p_idempotency_key: crypto.randomUUID()
      })
      .then((result) => result);
    const unpublishedRequest = household
      .rpc("serve_planned_portion", {
        p_meal_component_id: unservedMealComponentId,
        p_batch_id: recentBatch.data.batch_id,
        p_idempotency_key: "d3f74fe3-3d99-44a7-8095-4bf061239a6b"
      })
      .then((result) => result);
    await waitForBlockedServingRequest();
    retirementTransaction.release();
    const [unpublishedServe, unpublishedTransition] = await Promise.all([
      unpublishedRequest,
      unpublishedTransitionRequest,
      retirementTransaction.completed
    ]);
    expect(unpublishedServe.error).toBeNull();
    expect(unpublishedServe.data).toEqual({
      status: "rejected",
      reason: "preparation_not_approved"
    });
    expect(unpublishedTransition.error).toBeNull();
    expect(unpublishedTransition.data).toEqual({
      status: "rejected",
      reason: "preparation_not_approved"
    });

    const retiredRetry = await household.rpc("perform_batch_transition", {
      p_batch_id: cleanupBatch.data.batch_id,
      p_transition: "freeze",
      p_payload: {},
      p_idempotency_key: cleanupFreezeKey
    });
    expect(retiredRetry.error).toBeNull();
    expect(retiredRetry.data).toEqual({
      ...cleanupFrozen.data,
      idempotent_retry: true
    });
    const preparedEvent = await household
      .from("batch_events")
      .select("id")
      .eq("batch_id", cleanupBatch.data.batch_id)
      .eq("event_type", "prepared_or_opened")
      .single();
    expect(preparedEvent.error).toBeNull();
    const retiredCorrection = await household.rpc("perform_batch_transition", {
      p_batch_id: cleanupBatch.data.batch_id,
      p_transition: "correct",
      p_payload: {
        target_remaining_portions: 1,
        corrects_event_id: preparedEvent.data!.id,
        reason: "inventory_overcount"
      },
      p_idempotency_key: crypto.randomUUID()
    });
    expect(retiredCorrection.error).toBeNull();
    expect(retiredCorrection.data.remaining_portions).toBe(1);
    const retiredFinish = await household.rpc("perform_batch_transition", {
      p_batch_id: cleanupBatch.data.batch_id,
      p_transition: "finish",
      p_payload: {},
      p_idempotency_key: crypto.randomUUID()
    });
    expect(retiredFinish.error).toBeNull();
    expect(retiredFinish.data).toEqual(
      expect.objectContaining({
        status: "applied",
        lifecycle_state: "finished",
        remaining_portions: 0
      })
    );

    const unchanged = await household.rpc("get_kitchen_inventory");
    expect(
      unchanged.data.items.find(
        (item: { batch_id: string }) =>
          item.batch_id === recentBatch.data.batch_id
      )
    ).toEqual(expect.objectContaining({ remaining_portions: 2 }));
    fixtureValidated = true;
  });

  test("a reaction block remains visible and explicitly resolvable after its food content is retired", async () => {
    const servedEvent = await household
      .from("batch_events")
      .select("id")
      .eq("meal_component_id", secondServedMealComponentId)
      .eq("event_type", "served")
      .single();
    expect(servedEvent.error).toBeNull();

    const reported = await household.rpc("report_food_reaction", {
      p_served_event_id: servedEvent.data!.id,
      p_guidance_revision_id: "reaction-guidance-ticket-11-v4",
      p_preference: null,
      p_private_description: null,
      p_idempotency_key: crypto.randomUUID()
    });
    expect(reported.error).toBeNull();
    expect(reported.data).toEqual(
      expect.objectContaining({
        status: "reported",
        restriction_status: "reaction_reported"
      })
    );

    const activeBlocks = await household.rpc("get_active_reaction_blocks");
    expect(activeBlocks.error).toBeNull();
    expect(activeBlocks.data).toEqual({
      status: "ready",
      baby_id: babyId,
      items: [{ food_id: "food-ticket-06", food_name: "Ticket 06 Food" }]
    });

    const resolved = await household.rpc("resolve_food_reaction", {
      p_food_id: "food-ticket-06",
      p_idempotency_key: crypto.randomUUID()
    });
    expect(resolved.error).toBeNull();
    expect(resolved.data).toEqual(
      expect.objectContaining({
        status: "resolved",
        restriction_status: "no_known_restriction"
      })
    );

    const activeAfterResolution = await household.rpc(
      "get_active_reaction_blocks"
    );
    expect(activeAfterResolution.error).toBeNull();
    expect(activeAfterResolution.data.items).toEqual([]);

    const retiredGuidance = await admin
      .from("reaction_guidance_retirements")
      .insert([
        {
          guidance_revision_id: "reaction-guidance-ticket-11",
          retired_at: "2026-07-28",
          reason: "SYNTHETIC TEST FIXTURE CLEANUP"
        },
        {
          guidance_revision_id: "reaction-guidance-ticket-11-v3",
          retired_at: "2026-07-28",
          reason: "SYNTHETIC TEST FIXTURE CLEANUP"
        },
        {
          guidance_revision_id: "reaction-guidance-ticket-11-v4",
          retired_at: "2026-07-28",
          reason: "SYNTHETIC TEST FIXTURE CLEANUP"
        },
        {
          guidance_revision_id: "reaction-guidance-unrelated",
          retired_at: "2026-07-28",
          reason: "SYNTHETIC TEST FIXTURE CLEANUP"
        }
      ]);
    expect(retiredGuidance.error).toBeNull();
    const fixtureRetirements = await admin
      .from("reaction_guidance_retirements")
      .select("guidance_revision_id")
      .in("guidance_revision_id", [
        "reaction-guidance-ticket-11",
        "reaction-guidance-ticket-11-v2",
        "reaction-guidance-ticket-11-v3",
        "reaction-guidance-ticket-11-v4",
        "reaction-guidance-unrelated"
      ]);
    expect(fixtureRetirements.error).toBeNull();
    expect(fixtureRetirements.data).toHaveLength(5);
  });
});
