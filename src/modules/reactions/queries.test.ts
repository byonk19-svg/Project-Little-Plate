import { describe, expect, test } from "vitest";

import {
  parseActiveReactionBlocks,
  parseReactionReportContext
} from "@/modules/reactions/queries";

const readyContext = {
  status: "ready",
  served_event_id: "served-event-1",
  food_id: "food-1",
  food_name: "Reviewed food",
  guidance_revision_id: "guidance-1",
  guidance: "Reviewed care direction",
  source_title: "Reviewed source",
  source_url: "https://example.test/reaction",
  reviewed_at: "2026-07-28"
};

describe("reaction report transport", () => {
  test("accepts complete reviewed guidance and provenance", () => {
    expect(parseReactionReportContext(readyContext)).toEqual({
      servedEventId: "served-event-1",
      foodId: "food-1",
      foodName: "Reviewed food",
      guidanceRevisionId: "guidance-1",
      guidance: "Reviewed care direction",
      sourceTitle: "Reviewed source",
      sourceUrl: "https://example.test/reaction",
      reviewedAt: "2026-07-28"
    });
  });

  test.each([
    ["missing guidance", { ...readyContext, guidance: "" }],
    ["missing source", { ...readyContext, source_url: null }],
    ["unsupported status", { ...readyContext, status: "unavailable" }]
  ])("fails closed for %s", (_label, value) => {
    expect(parseReactionReportContext(value)).toBeNull();
  });

  test("accepts complete active reaction blocks", () => {
    expect(
      parseActiveReactionBlocks({
        status: "ready",
        items: [{ food_id: "food-1", food_name: "Reviewed food" }]
      })
    ).toEqual([{ foodId: "food-1", foodName: "Reviewed food" }]);
  });

  test.each([
    ["unsupported status", { status: "unavailable", items: [] }],
    ["missing item name", { status: "ready", items: [{ food_id: "food-1" }] }]
  ])("fails closed for active blocks with %s", (_label, value) => {
    expect(parseActiveReactionBlocks(value)).toBeNull();
  });
});
