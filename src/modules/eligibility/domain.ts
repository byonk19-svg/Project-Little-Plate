export type AbilityStatus = "observed" | "not_observed" | "not_sure";

export type RestrictionStatus =
  | "unknown"
  | "no_known_restriction"
  | "confirmed_allergy"
  | "directed_exclusion"
  | "temporary_avoidance"
  | "reaction_reported";

export type ExposureState =
  "liked" | "neutral" | "disliked" | "not_tried" | "skipped" | "unknown";

export type PreparationReviewStatus = "draft" | "in_review" | "approved";

export type PreparationEligibilityInput = {
  preparation: {
    isActive: boolean;
    reviewStatus: PreparationReviewStatus;
    isRetired: boolean;
    hasCompletePublicationRecord: boolean;
    requiredSkillIds: string[];
  };
  abilityStatuses: Record<string, AbilityStatus | undefined>;
  restrictionStatus: RestrictionStatus;
  exposureState: ExposureState;
};

export type PreparationEligibility =
  | { status: "eligible" }
  | {
      status: "ineligible";
      reason:
        | "preparation_not_approved"
        | "food_restricted"
        | "restriction_status_unknown"
        | "required_ability_not_observed";
    };

const blockingRestrictions: ReadonlySet<RestrictionStatus> = new Set([
  "confirmed_allergy",
  "directed_exclusion",
  "temporary_avoidance",
  "reaction_reported"
]);

export function evaluatePreparationEligibility(
  input: PreparationEligibilityInput
): PreparationEligibility {
  if (
    !input.preparation.isActive ||
    input.preparation.reviewStatus !== "approved" ||
    input.preparation.isRetired ||
    !input.preparation.hasCompletePublicationRecord
  ) {
    return { status: "ineligible", reason: "preparation_not_approved" };
  }

  if (blockingRestrictions.has(input.restrictionStatus)) {
    return { status: "ineligible", reason: "food_restricted" };
  }

  if (input.restrictionStatus === "unknown") {
    return { status: "ineligible", reason: "restriction_status_unknown" };
  }

  if (
    input.preparation.requiredSkillIds.some(
      (skillId) => input.abilityStatuses[skillId] !== "observed"
    )
  ) {
    return {
      status: "ineligible",
      reason: "required_ability_not_observed"
    };
  }

  return { status: "eligible" };
}
