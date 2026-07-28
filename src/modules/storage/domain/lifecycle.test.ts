import { describe, expect, test } from "vitest";

import {
  evaluateBatchTransition,
  type BatchTransitionInput
} from "@/modules/storage/domain/lifecycle";

const base: BatchTransitionInput = {
  state: "refrigerated",
  transition: "freeze",
  remainingPortions: 2,
  initialPortions: 2,
  hasReviewedRule: true,
  deadlinePassed: false,
  exposureState: null
};

describe("batch lifecycle transition filtering", () => {
  test.each([
    [
      "freeze untouched refrigerated portions",
      base,
      { allowed: true, nextState: "frozen" }
    ],
    [
      "reject freeze without a reviewed rule",
      { ...base, hasReviewedRule: false },
      { allowed: false, reason: "transition_rule_unavailable" }
    ],
    [
      "reject freeze after any portion was consumed",
      { ...base, remainingPortions: 1 },
      { allowed: false, reason: "batch_not_untouched" }
    ],
    [
      "reject freeze after the refrigerator deadline",
      { ...base, deadlinePassed: true },
      { allowed: false, reason: "batch_expired" }
    ],
    [
      "begin reviewed thawing",
      { ...base, state: "frozen", transition: "begin_thaw" },
      { allowed: true, nextState: "thawing" }
    ],
    [
      "reject beginning a thaw after the discard deadline",
      {
        ...base,
        state: "frozen",
        transition: "begin_thaw",
        deadlinePassed: true
      },
      { allowed: false, reason: "batch_expired" }
    ],
    [
      "mark a reviewed thaw complete",
      { ...base, state: "thawing", transition: "mark_thawed" },
      { allowed: true, nextState: "thawed" }
    ],
    [
      "reject marking a thaw complete after the discard deadline",
      {
        ...base,
        state: "thawing",
        transition: "mark_thawed",
        deadlinePassed: true
      },
      { allowed: false, reason: "batch_expired" }
    ],
    [
      "return only an untouched separately stored portion",
      {
        ...base,
        transition: "return_untouched",
        remainingPortions: 1,
        exposureState: "untouched_separately_stored"
      },
      { allowed: true, nextState: "refrigerated" }
    ],
    [
      "reject a saliva-exposed return",
      {
        ...base,
        transition: "return_untouched",
        remainingPortions: 1,
        exposureState: "saliva_exposed"
      },
      { allowed: false, reason: "portion_not_returnable" }
    ],
    [
      "finish a positive batch",
      { ...base, transition: "finish" },
      { allowed: true, nextState: "finished" }
    ],
    [
      "reject transitions from a terminal batch",
      { ...base, state: "discarded", transition: "finish" },
      { allowed: false, reason: "batch_terminal" }
    ]
  ])("%s", (_label, input, expected) => {
    expect(evaluateBatchTransition(input as BatchTransitionInput)).toEqual(
      expected
    );
  });
});
