import {
  explainPlannerReasons,
  planDeterministicWeek,
  type FeasiblePlan,
  type PlannerInput,
  type PreparationTime
} from "./engine";

type JsonRecord = Record<string, unknown>;

export type PlannerGenerationFailure =
  | "snapshot_unavailable"
  | "invalid_snapshot"
  | "no_eligible_candidate"
  | "locked_component_ineligible"
  | "storage_infeasible";

export type PlannerGenerationAttempt =
  | {
      status: "feasible";
      expectedVersion: number;
      inputToken: string;
      referenceAt: string;
      output: FeasiblePlan & { explanations: JsonRecord };
    }
  | { status: "infeasible"; reason: PlannerGenerationFailure };

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value !== "" ? value : null;
}

function requiredInteger(record: JsonRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function mappedRestriction(value: unknown) {
  if (value === "no_known_restriction") return "allowed" as const;
  if (value === "reaction_reported") return "reaction_reported" as const;
  return "blocked" as const;
}

function mappedExposure(value: unknown) {
  if (value === "liked" || value === "neutral" || value === "disliked") {
    return "familiar" as const;
  }
  if (value === "not_tried") return "new" as const;
  return "unknown" as const;
}

function mappedPace(
  value: unknown
): PlannerInput["preferences"]["newFoodPace"] {
  if (value === "no_new_foods") return "none";
  if (value === "one_per_week" || value === "two_per_week") return value;
  return "flexible";
}

function strings(value: unknown): string[] | null {
  return Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" && entry !== "")
    ? value
    : null;
}

export function buildPlannerGenerationAttempt(
  snapshot: unknown
): PlannerGenerationAttempt {
  if (!isRecord(snapshot) || snapshot.status !== "ready") {
    return { status: "infeasible", reason: "snapshot_unavailable" };
  }

  const referenceAt = requiredString(snapshot, "reference_at");
  const timeZone = requiredString(snapshot, "time_zone");
  const inputToken = requiredString(snapshot, "input_token");
  const expectedVersion = requiredInteger(snapshot, "expected_version");
  const feeding = snapshot.feeding;
  const mealRequests = snapshot.meal_requests;
  const rawCandidates = snapshot.candidates;
  const rawInventory = snapshot.inventory;
  if (
    !referenceAt ||
    !timeZone ||
    !inputToken ||
    expectedVersion === null ||
    !isRecord(feeding) ||
    !isRecord(feeding.preferences) ||
    !Array.isArray(feeding.skills) ||
    !Array.isArray(feeding.foods) ||
    !Array.isArray(mealRequests) ||
    !Array.isArray(rawCandidates) ||
    !Array.isArray(rawInventory)
  ) {
    return { status: "infeasible", reason: "snapshot_unavailable" };
  }

  const meals = mealRequests.map((value) => {
    if (!isRecord(value) || !Array.isArray(value.locked_components)) {
      return null;
    }
    const mealId = requiredString(value, "meal_id");
    const localDate = requiredString(value, "local_date");
    const mealSlot = requiredString(value, "meal_slot");
    const consumeBy = requiredString(value, "consume_by");
    const componentCount = requiredInteger(value, "component_count");
    const lockedComponents = value.locked_components.map((locked) => {
      if (!isRecord(locked)) return null;
      const position = requiredInteger(locked, "position");
      const preparationId = requiredString(locked, "preparation_id");
      const revisionId = requiredString(locked, "revision_id");
      return position !== null && preparationId && revisionId
        ? { position, preparationId, revisionId }
        : null;
    });
    return mealId &&
      localDate &&
      mealSlot &&
      consumeBy &&
      componentCount !== null &&
      typeof value.is_locked === "boolean" &&
      lockedComponents.every((locked) => locked !== null)
      ? {
          mealId,
          localDate,
          mealSlot,
          consumeBy,
          componentCount,
          isLocked: value.is_locked,
          lockedComponents:
            lockedComponents as PlannerInput["mealRequests"][number]["lockedComponents"]
        }
      : null;
  });

  const foodById = new Map(
    feeding.foods
      .filter(isRecord)
      .map((food) => [food.id, food] as const)
      .filter(([foodId]) => typeof foodId === "string")
  );

  const candidates = rawCandidates.map((value) => {
    if (!isRecord(value) || !Array.isArray(value.refrigerator_profiles)) {
      return null;
    }
    const preparationId = requiredString(value, "preparation_id");
    const revisionId = requiredString(value, "revision_id");
    const foodId = requiredString(value, "food_id");
    const requiredSkillTagIds = strings(value.required_skill_tag_ids);
    const food = foodId ? foodById.get(foodId) : undefined;
    if (
      !preparationId ||
      !revisionId ||
      !foodId ||
      !requiredSkillTagIds ||
      !food
    ) {
      return null;
    }
    const exposureState = mappedExposure(food.exposure_state);
    const restrictionStatus = mappedRestriction(food.restriction_status);
    const strategies = value.refrigerator_profiles
      .map((profile) => {
        if (!isRecord(profile)) return null;
        const profileId = requiredString(profile, "profile_id");
        const duration = requiredInteger(profile, "duration_min_hours");
        if (!profileId || duration === null || duration <= 0) return null;
        const supportedMealIds = meals
          .filter(
            (meal): meal is NonNullable<typeof meal> =>
              meal !== null &&
              Date.parse(meal.consumeBy) <=
                Date.parse(referenceAt) + duration * 60 * 60 * 1000
          )
          .map((meal) => meal.mealId);
        return supportedMealIds.length > 0
          ? {
              strategyId: profileId,
              storageLocation: "refrigerator" as const,
              storageRuleRevisionId: profileId,
              supportedMealIds
            }
          : null;
      })
      .filter((strategy) => strategy !== null);

    return {
      preparationId,
      revisionId,
      foodId,
      methodTagIds: [],
      textureTagIds: [],
      published: true,
      requiredSkillTagIds,
      restrictionStatus,
      reactionBlocked: restrictionStatus === "reaction_reported",
      exposureState,
      preparationTime: "unavailable" as const,
      newPortionStrategies: strategies
    };
  });

  const inventory = rawInventory
    .map((value) => {
      if (!isRecord(value)) return null;
      const lifecycle = value.lifecycle_state;
      if (lifecycle !== "refrigerated" && lifecycle !== "thawed") return null;
      const batchId = requiredString(value, "batch_id");
      const preparationId = requiredString(value, "preparation_id");
      const revisionId = requiredString(value, "content_revision_id");
      const validUntil = requiredString(value, "deadline_at");
      const deadlineRuleRevisionId = requiredString(value, "rule_profile_id");
      const portions = requiredInteger(value, "remaining_portions");
      return batchId &&
        preparationId &&
        revisionId &&
        validUntil &&
        deadlineRuleRevisionId &&
        portions !== null
        ? {
            batchId,
            preparationId,
            revisionId,
            location:
              lifecycle === "refrigerated"
                ? ("refrigerator" as const)
                : ("thawed" as const),
            portions,
            validUntil,
            deadlineRuleRevisionId
          }
        : null;
    })
    .filter((item) => item !== null);

  const skillSnapshot: PlannerInput["skillSnapshot"] = feeding.skills.flatMap(
    (value) => {
      if (!isRecord(value)) return [];
      const skillTagId = requiredString(value, "id");
      return skillTagId &&
        (value.status === "observed" ||
          value.status === "not_observed" ||
          value.status === "not_sure")
        ? [{ skillTagId, status: value.status }]
        : [];
    }
  );
  const restrictionSnapshot = candidates
    .filter((candidate) => candidate !== null)
    .map((candidate) => ({
      foodId: candidate.foodId,
      status: candidate.restrictionStatus,
      version: 1
    }));
  const exposureSnapshot = candidates
    .filter((candidate) => candidate !== null)
    .map((candidate) => ({
      foodId: candidate.foodId,
      state: candidate.exposureState
    }));
  const quickBackupFoodIds = feeding.foods
    .filter(isRecord)
    .filter((food) => food.is_quick_backup === true)
    .map((food) => food.id)
    .filter((foodId): foodId is string => typeof foodId === "string");
  const preparationTime = feeding.preferences.preparation_time;

  if (
    meals.some((meal) => meal === null) ||
    candidates.some((candidate) => candidate === null) ||
    !(
      preparationTime === "under_15_minutes" ||
      preparationTime === "under_30_minutes" ||
      preparationTime === "flexible"
    )
  ) {
    return { status: "infeasible", reason: "invalid_snapshot" };
  }

  const ruleRevisionIds = [
    ...new Set([
      ...candidates.flatMap((candidate) =>
        candidate!.newPortionStrategies.map(
          (strategy) => strategy.storageRuleRevisionId
        )
      ),
      ...inventory.map((item) => item.deadlineRuleRevisionId)
    ])
  ];
  if (candidates.length === 0) {
    return { status: "infeasible", reason: "no_eligible_candidate" };
  }
  if (ruleRevisionIds.length === 0) {
    return { status: "infeasible", reason: "storage_infeasible" };
  }

  const result = planDeterministicWeek({
    clock: referenceAt,
    timeZone,
    mealCount: meals.length,
    ruleRevisionIds,
    mealRequests: meals as PlannerInput["mealRequests"],
    preparations: candidates as PlannerInput["preparations"],
    inventory,
    skillSnapshot,
    restrictionSnapshot,
    exposureSnapshot,
    quickBackupFoodIds,
    preferences: {
      preparationTime: preparationTime as PreparationTime,
      newFoodPace: mappedPace(feeding.preferences.new_food_pace)
    }
  });

  if (result.status === "infeasible") {
    return { status: "infeasible", reason: result.reason };
  }

  return {
    status: "feasible",
    expectedVersion,
    inputToken,
    referenceAt,
    output: {
      ...result,
      explanations: {
        meals: result.plan.meals.map((meal) => ({
          mealId: meal.mealId,
          components: meal.components.map((component) => ({
            position: component.position,
            preparationId: component.preparationId,
            messages: explainPlannerReasons(component.reasonCodes)
          }))
        }))
      }
    }
  };
}
