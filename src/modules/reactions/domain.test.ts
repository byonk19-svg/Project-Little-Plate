import { describe, expect, test } from "vitest";

import { evaluateReactionTransition } from "@/modules/reactions/domain";

describe("reaction safety-block transitions", () => {
  test("a reviewed report after serving creates a safety block independently of preference", () => {
    expect(
      evaluateReactionTransition({
        transition: "report",
        currentRestriction: "no_known_restriction",
        hasServedEvent: true,
        hasReviewedGuidance: true,
        preference: "disliked"
      })
    ).toEqual({
      allowed: true,
      nextRestriction: "reaction_reported",
      nextPreference: "disliked"
    });
  });

  test.each([
    ["missing served event", false, true, "served_event_required"],
    ["missing reviewed guidance", true, false, "reviewed_guidance_unavailable"]
  ])(
    "fails closed when a report has %s",
    (_label, hasServedEvent, hasReviewedGuidance, reason) => {
      expect(
        evaluateReactionTransition({
          transition: "report",
          currentRestriction: "no_known_restriction",
          hasServedEvent,
          hasReviewedGuidance,
          preference: null
        })
      ).toEqual({ allowed: false, reason });
    }
  );

  test("ordinary preference changes cannot clear an active reaction block", () => {
    expect(
      evaluateReactionTransition({
        transition: "update_preference",
        currentRestriction: "reaction_reported",
        hasServedEvent: false,
        hasReviewedGuidance: false,
        preference: "liked"
      })
    ).toEqual({
      allowed: true,
      nextRestriction: "reaction_reported",
      nextPreference: "liked"
    });
  });

  test("resolution is a separate explicit transition", () => {
    expect(
      evaluateReactionTransition({
        transition: "resolve",
        currentRestriction: "reaction_reported",
        hasServedEvent: false,
        hasReviewedGuidance: false,
        preference: null
      })
    ).toEqual({
      allowed: true,
      nextRestriction: "no_known_restriction",
      nextPreference: null
    });
  });

  test("resolution cannot create eligibility when no active block exists", () => {
    expect(
      evaluateReactionTransition({
        transition: "resolve",
        currentRestriction: "no_known_restriction",
        hasServedEvent: false,
        hasReviewedGuidance: false,
        preference: null
      })
    ).toEqual({ allowed: false, reason: "reaction_block_not_active" });
  });
});
