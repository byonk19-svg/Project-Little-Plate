import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import {
  productEventReasonCodes,
  safeReasonCode,
  toProductEventRpc
} from "./events";

describe("privacy-safe product events", () => {
  test("serializes representative workflow events into fixed scalar fields", () => {
    expect(
      toProductEventRpc({
        name: "serving_outcome",
        key: "event-key",
        operation: "serve",
        outcome: "rejected",
        reasonCode: "batch_expired"
      })
    ).toEqual({
      p_event_name: "serving_outcome",
      p_event_key: "event-key",
      p_outcome: "rejected",
      p_reason_code: "batch_expired",
      p_operation: "serve",
      p_state: null,
      p_duration_bucket: null,
      p_workflow: null,
      p_friction_code: null,
      p_severity: null
    });

    expect(
      toProductEventRpc({
        name: "feedback_submitted",
        key: "feedback-key",
        workflow: "today",
        frictionCode: "answer_not_clear",
        severity: "blocking"
      })
    ).toEqual(
      expect.objectContaining({
        p_event_name: "feedback_submitted",
        p_workflow: "today",
        p_friction_code: "answer_not_clear",
        p_severity: "blocking"
      })
    );
  });

  test("has no payload surface for child, allergy, reaction, medical, or free-text fields", () => {
    const payload = toProductEventRpc({
      name: "generation_failed",
      key: "generation-key",
      operation: "regenerate",
      outcome: "rejected",
      reasonCode: "planner_input_stale"
    });
    expect(Object.keys(payload).sort()).toEqual([
      "p_duration_bucket",
      "p_event_key",
      "p_event_name",
      "p_friction_code",
      "p_operation",
      "p_outcome",
      "p_reason_code",
      "p_severity",
      "p_state",
      "p_workflow"
    ]);
    expect(JSON.stringify(payload)).not.toMatch(
      /birth|allerg|reaction|medical|note|description/i
    );
  });

  test("normalizes unexpected failure text to a non-sensitive code", () => {
    expect(safeReasonCode("plan_stale")).toBe("plan_stale");
    expect(safeReasonCode("invalid_prepared_time")).toBe("unavailable");
    expect(safeReasonCode("Call clinician about reaction details")).toBe(
      "unavailable"
    );
  });

  test("keeps the TypeScript reason inventory aligned with the database allowlist", () => {
    const migration = readFileSync(
      "supabase/migrations/20260729210000_add_privacy_safe_learning.sql",
      "utf8"
    );
    const reasonConstraint = migration.match(
      /reason_code text check \(([\s\S]+?)\n  \),\n  operation text check/
    )?.[1];
    expect(reasonConstraint).toBeTruthy();
    const databaseCodes = [...(reasonConstraint?.matchAll(/'([^']+)'/g) ?? [])]
      .map((match) => match[1])
      .sort();
    expect(databaseCodes).toEqual([...productEventReasonCodes].sort());
  });
});
