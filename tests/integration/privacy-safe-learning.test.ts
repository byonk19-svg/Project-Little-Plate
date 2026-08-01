import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  authenticatedClient,
  type LocalSupabaseStatus,
  readLocalSupabaseStatus,
  waitForAuth
} from "./support/local-supabase";

describe("privacy-safe learning and operations", () => {
  let status: LocalSupabaseStatus;
  let admin: SupabaseClient;
  let household: SupabaseClient;
  let otherHousehold: SupabaseClient;
  let userId: string;
  const createdUserIds: string[] = [];

  async function createUser(label: string) {
    const email = `ticket-15-${label}-${crypto.randomUUID()}@example.test`;
    const password = `Ticket-15-${crypto.randomUUID()}`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    expect(created.error).toBeNull();
    createdUserIds.push(created.data.user!.id);
    const client = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const session = await client.auth.signInWithPassword({ email, password });
    expect(session.error).toBeNull();
    return {
      id: created.data.user!.id,
      client: authenticatedClient(status, session.data.session!.access_token)
    };
  }

  beforeAll(async () => {
    status = readLocalSupabaseStatus();
    await waitForAuth(status);
    admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const first = await createUser("household");
    const second = await createUser("other");
    household = first.client;
    otherHousehold = second.client;
    userId = first.id;
    expect((await household.rpc("bootstrap_account")).error).toBeNull();
    expect((await otherHousehold.rpc("bootstrap_account")).error).toBeNull();
    expect(
      (
        await household.rpc("complete_baby_profile", {
          p_nickname: "Analytics baby",
          p_birth_date: "2025-10-15",
          p_time_zone: "America/Chicago",
          p_feeding_style: "mixed",
          p_meal_slots: ["breakfast"]
        })
      ).error
    ).toBeNull();
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of createdUserIds) {
      expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
    }
  });

  test("records only fixed privacy-safe fields and deduplicates retries", async () => {
    const eventKey = crypto.randomUUID();
    const payload = {
      p_event_name: "serving_outcome",
      p_event_key: eventKey,
      p_outcome: "rejected",
      p_reason_code: "batch_expired",
      p_operation: "serve",
      p_state: null,
      p_duration_bucket: null,
      p_workflow: null,
      p_friction_code: null,
      p_severity: null
    };
    const first = await household.rpc("record_product_event", payload);
    expect(first.error).toBeNull();
    expect(first.data).toEqual({ status: "recorded", duplicate: false });
    const retry = await household.rpc("record_product_event", payload);
    expect(retry.error).toBeNull();
    expect(retry.data).toEqual({ status: "recorded", duplicate: true });

    const feedback = await household.rpc("record_product_event", {
      p_event_name: "feedback_submitted",
      p_event_key: crypto.randomUUID(),
      p_outcome: null,
      p_reason_code: null,
      p_operation: null,
      p_state: null,
      p_duration_bucket: null,
      p_workflow: "today",
      p_friction_code: "answer_not_clear",
      p_severity: "blocking"
    });
    expect(feedback.error).toBeNull();
    expect(feedback.data.status).toBe("recorded");

    const rows = await household
      .from("product_events")
      .select(
        "event_name,outcome,reason_code,operation,state,duration_bucket,workflow,friction_code,severity,event_key"
      )
      .order("occurred_at");
    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([
      {
        event_name: "serving_outcome",
        outcome: "rejected",
        reason_code: "batch_expired",
        operation: "serve",
        state: null,
        duration_bucket: null,
        workflow: null,
        friction_code: null,
        severity: null,
        event_key: eventKey
      },
      expect.objectContaining({
        event_name: "feedback_submitted",
        workflow: "today",
        friction_code: "answer_not_clear",
        severity: "blocking"
      })
    ]);
  });

  test("rejects unapproved reason text and enforces append-only household isolation", async () => {
    const rejected = await household.rpc("record_product_event", {
      p_event_name: "serving_outcome",
      p_event_key: crypto.randomUUID(),
      p_outcome: "rejected",
      p_reason_code: "child_name_alice",
      p_operation: "serve",
      p_state: null,
      p_duration_bucket: null,
      p_workflow: null,
      p_friction_code: null,
      p_severity: null
    });
    expect(rejected.error).toBeNull();
    expect(rejected.data).toEqual({
      status: "rejected",
      reason: "invalid_event"
    });
    expect(
      (await otherHousehold.from("product_events").select("*")).data
    ).toEqual([]);
    expect(
      (
        await household.from("product_events").insert({
          household_id: crypto.randomUUID(),
          actor_user_id: userId,
          event_name: "today_opened",
          state: "ready",
          event_key: crypto.randomUUID()
        })
      ).error
    ).not.toBeNull();
    const own = await household
      .from("product_events")
      .select("id")
      .limit(1)
      .single();
    expect(own.error).toBeNull();
    expect(
      (
        await household
          .from("product_events")
          .update({ state: "empty" })
          .eq("id", own.data!.id)
      ).error
    ).not.toBeNull();
  });

  test("exposes privacy-safe inventory health without food or reaction content", async () => {
    const health = await household.rpc("get_inventory_health");
    expect(health.error).toBeNull();
    expect(health.data).toEqual({ status: "ready", items: [] });
    expect(JSON.stringify(health.data)).not.toMatch(
      /food|birth|allerg|reaction|medical|note|description/i
    );
  });
});
