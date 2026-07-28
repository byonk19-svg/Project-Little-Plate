import { describe, expect, test } from "vitest";

import { parseKitchenInventoryItem } from "@/modules/storage/queries";

const validItem = {
  batch_id: "batch-1",
  preparation_id: "preparation-1",
  content_revision_id: "revision-1",
  preparation_name: "Reviewed preparation",
  storage_location: "refrigerator",
  lifecycle_state: "refrigerated",
  remaining_portions: 2,
  prepared_or_opened_at: "2026-07-28T12:00:00.000Z",
  deadline_at: "2026-07-29T12:00:00.000Z",
  original_deadline_at: "2026-07-29T12:00:00.000Z",
  deadline_kind: "discard_after",
  quality_by_at: null,
  storage_status: "ready",
  rule_profile_id: "profile-1",
  storage_rule_id: "rule-1",
  applied_duration_hours: 24,
  reviewed_duration_range_hours: { minimum: 24, maximum: 48 },
  guidance: "Reviewed guidance",
  reviewed_at: "2026-07-28",
  source_title: "Reviewed source",
  source_url: "https://example.test/source",
  transition_method: null,
  refreezing_policy: null,
  action_guidance: null,
  action_method: null,
  action_refreezing_policy: null,
  action_return_policy: null,
  action_source_title: null,
  action_source_url: null,
  available_actions: ["finish", "correct", "discard"],
  return_served_event_id: null,
  correction_event_id: "event-1"
};

describe("Kitchen inventory transport", () => {
  test("accepts reviewed thaw guidance before its clock starts", () => {
    expect(
      parseKitchenInventoryItem({
        ...validItem,
        storage_location: "freezer",
        lifecycle_state: "thawing",
        storage_status: "thawing",
        applied_duration_hours: null,
        reviewed_duration_range_hours: { minimum: 10, maximum: 16 },
        transition_method: "Reviewed thaw method",
        refreezing_policy: "prohibited",
        available_actions: ["mark_thawed", "finish", "correct", "discard"]
      })
    ).not.toBeNull();
  });

  test("fails closed when a correction action lacks its compensating event", () => {
    expect(parseKitchenInventoryItem(validItem)).not.toBeNull();
    expect(
      parseKitchenInventoryItem({
        ...validItem,
        correction_event_id: null
      })
    ).toBeNull();
  });
});
