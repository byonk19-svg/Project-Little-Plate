import { describe, expect, test } from "vitest";

import {
  evaluatePreparationEligibility,
  type PreparationEligibilityInput
} from "./domain";

const eligibleInput: PreparationEligibilityInput = {
  preparation: {
    isActive: true,
    reviewStatus: "approved",
    isRetired: false,
    hasCompletePublicationRecord: true,
    requiredSkillIds: ["skill-synthetic-sit", "skill-synthetic-move-food"]
  },
  abilityStatuses: {
    "skill-synthetic-sit": "observed",
    "skill-synthetic-move-food": "observed"
  },
  restrictionStatus: "no_known_restriction",
  exposureState: "unknown"
};

describe("preparation eligibility", () => {
  test("requires every reviewed skill to be recorded as observed", () => {
    expect(
      evaluatePreparationEligibility({
        ...eligibleInput,
        abilityStatuses: {
          "skill-synthetic-sit": "observed",
          "skill-synthetic-move-food": "not_sure"
        }
      })
    ).toEqual({
      status: "ineligible",
      reason: "required_ability_not_observed"
    });

    expect(
      evaluatePreparationEligibility({
        ...eligibleInput,
        abilityStatuses: {
          "skill-synthetic-sit": "observed"
        }
      })
    ).toEqual({
      status: "ineligible",
      reason: "required_ability_not_observed"
    });
  });

  test.each([
    "confirmed_allergy",
    "directed_exclusion",
    "temporary_avoidance",
    "reaction_reported"
  ] as const)("%s blocks eligibility regardless of preference", (status) => {
    expect(
      evaluatePreparationEligibility({
        ...eligibleInput,
        restrictionStatus: status,
        exposureState: "liked"
      })
    ).toEqual({ status: "ineligible", reason: "food_restricted" });
  });

  test("preference remains independent from safety eligibility", () => {
    expect(
      evaluatePreparationEligibility({
        ...eligibleInput,
        exposureState: "disliked"
      })
    ).toEqual({ status: "eligible" });
  });

  test("missing restriction status does not become proof of eligibility", () => {
    expect(
      evaluatePreparationEligibility({
        ...eligibleInput,
        restrictionStatus: "unknown"
      })
    ).toEqual({
      status: "ineligible",
      reason: "restriction_status_unknown"
    });
  });

  test.each([
    {
      isActive: false,
      reviewStatus: "approved" as const,
      isRetired: false,
      hasCompletePublicationRecord: true
    },
    {
      isActive: true,
      reviewStatus: "draft" as const,
      isRetired: false,
      hasCompletePublicationRecord: true
    },
    {
      isActive: true,
      reviewStatus: "in_review" as const,
      isRetired: false,
      hasCompletePublicationRecord: true
    },
    {
      isActive: true,
      reviewStatus: "approved" as const,
      isRetired: true,
      hasCompletePublicationRecord: true
    },
    {
      isActive: true,
      reviewStatus: "approved" as const,
      isRetired: false,
      hasCompletePublicationRecord: false
    }
  ])(
    "rejects preparation content that is not active and approved",
    ({ isActive, reviewStatus, isRetired, hasCompletePublicationRecord }) => {
      expect(
        evaluatePreparationEligibility({
          ...eligibleInput,
          preparation: {
            ...eligibleInput.preparation,
            isActive,
            reviewStatus,
            isRetired,
            hasCompletePublicationRecord
          }
        })
      ).toEqual({
        status: "ineligible",
        reason: "preparation_not_approved"
      });
    }
  );
});
