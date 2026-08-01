import type {
  ExposureState,
  RestrictionStatus
} from "@/modules/eligibility/domain";

type ReactionPreference = Extract<
  ExposureState,
  "liked" | "neutral" | "disliked"
>;

type ReactionTransitionInput = {
  transition: "report" | "resolve" | "update_preference";
  currentRestriction: RestrictionStatus;
  hasServedEvent: boolean;
  hasReviewedGuidance: boolean;
  preference: ReactionPreference | null;
};

type ReactionTransitionResult =
  | {
      allowed: true;
      nextRestriction: RestrictionStatus;
      nextPreference: ReactionPreference | null;
    }
  | {
      allowed: false;
      reason:
        | "served_event_required"
        | "reviewed_guidance_unavailable"
        | "reaction_block_already_active"
        | "reaction_block_not_active";
    };

export function evaluateReactionTransition({
  transition,
  currentRestriction,
  hasServedEvent,
  hasReviewedGuidance,
  preference
}: ReactionTransitionInput): ReactionTransitionResult {
  if (transition === "update_preference") {
    return {
      allowed: true,
      nextRestriction: currentRestriction,
      nextPreference: preference
    };
  }

  if (transition === "report") {
    if (!hasServedEvent) {
      return { allowed: false, reason: "served_event_required" };
    }
    if (!hasReviewedGuidance) {
      return { allowed: false, reason: "reviewed_guidance_unavailable" };
    }
    if (currentRestriction === "reaction_reported") {
      return { allowed: false, reason: "reaction_block_already_active" };
    }
    return {
      allowed: true,
      nextRestriction: "reaction_reported",
      nextPreference: preference
    };
  }

  if (currentRestriction !== "reaction_reported") {
    return { allowed: false, reason: "reaction_block_not_active" };
  }

  return {
    allowed: true,
    nextRestriction: "no_known_restriction",
    nextPreference: preference
  };
}
