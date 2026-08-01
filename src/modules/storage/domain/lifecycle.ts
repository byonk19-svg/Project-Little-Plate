export type BatchLifecycleState =
  "refrigerated" | "frozen" | "thawing" | "thawed" | "finished" | "discarded";

export type BatchTransition =
  "freeze" | "begin_thaw" | "mark_thawed" | "return_untouched" | "finish";

export type BatchTransitionInput = {
  state: BatchLifecycleState;
  transition: BatchTransition;
  remainingPortions: number;
  initialPortions: number;
  hasReviewedRule: boolean;
  deadlinePassed: boolean;
  exposureState: "untouched_separately_stored" | "saliva_exposed" | null;
};

export type BatchTransitionResult =
  | { allowed: true; nextState: BatchLifecycleState }
  | { allowed: false; reason: string };

export function evaluateBatchTransition({
  state,
  transition,
  remainingPortions,
  initialPortions,
  hasReviewedRule,
  deadlinePassed,
  exposureState
}: BatchTransitionInput): BatchTransitionResult {
  if (state === "finished" || state === "discarded") {
    return { allowed: false, reason: "batch_terminal" };
  }

  if (remainingPortions <= 0) {
    return { allowed: false, reason: "batch_depleted" };
  }

  if (transition === "finish") {
    return { allowed: true, nextState: "finished" };
  }

  if (!hasReviewedRule) {
    return { allowed: false, reason: "transition_rule_unavailable" };
  }

  if (transition === "freeze") {
    if (state !== "refrigerated") {
      return { allowed: false, reason: "invalid_batch_transition" };
    }
    if (remainingPortions !== initialPortions) {
      return { allowed: false, reason: "batch_not_untouched" };
    }
    if (deadlinePassed) {
      return { allowed: false, reason: "batch_expired" };
    }
    return { allowed: true, nextState: "frozen" };
  }

  if (transition === "begin_thaw") {
    if (state !== "frozen") {
      return { allowed: false, reason: "invalid_batch_transition" };
    }
    if (deadlinePassed) {
      return { allowed: false, reason: "batch_expired" };
    }
    return { allowed: true, nextState: "thawing" };
  }

  if (transition === "mark_thawed") {
    if (state !== "thawing") {
      return { allowed: false, reason: "invalid_batch_transition" };
    }
    if (deadlinePassed) {
      return { allowed: false, reason: "batch_expired" };
    }
    return { allowed: true, nextState: "thawed" };
  }

  if (transition === "return_untouched") {
    if (state !== "refrigerated" && state !== "thawed") {
      return { allowed: false, reason: "invalid_batch_transition" };
    }
    if (exposureState !== "untouched_separately_stored") {
      return { allowed: false, reason: "portion_not_returnable" };
    }
    if (remainingPortions >= initialPortions) {
      return { allowed: false, reason: "batch_portion_limit" };
    }
    if (deadlinePassed) {
      return { allowed: false, reason: "batch_expired" };
    }
    return { allowed: true, nextState: state };
  }

  return { allowed: false, reason: "invalid_batch_transition" };
}
