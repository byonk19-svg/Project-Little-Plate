import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  AbilityStatus,
  ExposureState,
  RestrictionStatus
} from "@/modules/eligibility/domain";

export type NewFoodPace =
  "no_new_foods" | "one_per_week" | "two_per_week" | "three_per_week";

export type PreparationTimePreference =
  "under_15_minutes" | "under_30_minutes" | "flexible";

export type FeedingConfiguration = {
  skills: Array<{
    id: string;
    label: string;
    status: AbilityStatus | null;
  }>;
  foods: Array<{
    id: string;
    name: string;
    restrictionStatus: RestrictionStatus | null;
    exposureState: ExposureState | null;
    exposureSelectable: boolean;
    isQuickBackup: boolean;
  }>;
  preferences: {
    newFoodPace: NewFoodPace;
    preparationTime: PreparationTimePreference;
    prepDay: number | null;
  } | null;
};

export type FeedingConfigurationResult =
  | { status: "ready"; configuration: FeedingConfiguration }
  | { status: "unavailable"; configuration: null };

export type PreparationEligibilityResult =
  | { status: "eligible" }
  | {
      status: "ineligible";
      reason:
        | "food_restricted"
        | "restriction_status_unknown"
        | "required_ability_not_observed";
    }
  | {
      status: "unsupported";
      reason: "profile_unavailable" | "preparation_not_approved";
    };

type JsonRecord = Record<string, unknown>;

const abilityStatuses = new Set<AbilityStatus>([
  "observed",
  "not_observed",
  "not_sure"
]);
const restrictionStatuses = new Set<RestrictionStatus>([
  "no_known_restriction",
  "confirmed_allergy",
  "directed_exclusion",
  "temporary_avoidance",
  "reaction_reported"
]);
const exposureStates = new Set<ExposureState>([
  "liked",
  "neutral",
  "disliked",
  "not_tried",
  "skipped",
  "unknown"
]);
const newFoodPaces = new Set<NewFoodPace>([
  "no_new_foods",
  "one_per_week",
  "two_per_week",
  "three_per_week"
]);
const preparationTimes = new Set<PreparationTimePreference>([
  "under_15_minutes",
  "under_30_minutes",
  "flexible"
]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value !== "" ? value : null;
}

function parseNullableEnum<T extends string>(
  value: unknown,
  values: ReadonlySet<T>
): T | null | undefined {
  if (value === null) {
    return null;
  }
  return typeof value === "string" && values.has(value as T)
    ? (value as T)
    : undefined;
}

function parseConfiguration(value: unknown): FeedingConfiguration | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.skills) ||
    !Array.isArray(value.foods)
  ) {
    return null;
  }

  const skills = value.skills.map((skill) => {
    if (!isRecord(skill)) {
      return null;
    }
    const id = stringValue(skill, "id");
    const label = stringValue(skill, "label");
    const status = parseNullableEnum(skill.status, abilityStatuses);
    return id && label && status !== undefined ? { id, label, status } : null;
  });

  const foods = value.foods.map((food) => {
    if (!isRecord(food)) {
      return null;
    }
    const id = stringValue(food, "id");
    const name = stringValue(food, "name");
    const restrictionStatus = parseNullableEnum(
      food.restriction_status,
      restrictionStatuses
    );
    const exposureState = parseNullableEnum(
      food.exposure_state,
      exposureStates
    );
    const exposureSelectable = food.exposure_selectable;
    const isQuickBackup = food.is_quick_backup;

    return id &&
      name &&
      restrictionStatus !== undefined &&
      exposureState !== undefined &&
      typeof exposureSelectable === "boolean" &&
      typeof isQuickBackup === "boolean"
      ? {
          id,
          name,
          restrictionStatus,
          exposureState,
          exposureSelectable,
          isQuickBackup
        }
      : null;
  });

  if (
    skills.some((skill) => skill === null) ||
    foods.some((food) => food === null)
  ) {
    return null;
  }

  let preferences: FeedingConfiguration["preferences"] = null;
  if (value.preferences !== null) {
    if (!isRecord(value.preferences)) {
      return null;
    }
    const newFoodPace = value.preferences.new_food_pace;
    const preparationTime = value.preferences.preparation_time;
    const prepDay = value.preferences.prep_day;
    if (
      typeof newFoodPace !== "string" ||
      !newFoodPaces.has(newFoodPace as NewFoodPace) ||
      typeof preparationTime !== "string" ||
      !preparationTimes.has(preparationTime as PreparationTimePreference) ||
      (prepDay !== null &&
        (typeof prepDay !== "number" ||
          !Number.isInteger(prepDay) ||
          prepDay < 0 ||
          prepDay > 6))
    ) {
      return null;
    }
    preferences = {
      newFoodPace: newFoodPace as NewFoodPace,
      preparationTime: preparationTime as PreparationTimePreference,
      prepDay
    };
  }

  return {
    skills: skills as FeedingConfiguration["skills"],
    foods: foods as FeedingConfiguration["foods"],
    preferences
  };
}

export async function getFeedingConfiguration(): Promise<FeedingConfigurationResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_feeding_configuration");
  const configuration = error ? null : parseConfiguration(data);

  return configuration
    ? { status: "ready", configuration }
    : { status: "unavailable", configuration: null };
}

export async function getPreparationEligibility(
  slug: string
): Promise<PreparationEligibilityResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_preparation_eligibility", {
    p_slug: slug
  });

  if (error || !isRecord(data)) {
    return { status: "unsupported", reason: "profile_unavailable" };
  }

  if (data.status === "eligible") {
    return { status: "eligible" };
  }

  if (
    data.status === "ineligible" &&
    (data.reason === "food_restricted" ||
      data.reason === "restriction_status_unknown" ||
      data.reason === "required_ability_not_observed")
  ) {
    return { status: "ineligible", reason: data.reason };
  }

  if (
    data.status === "unsupported" &&
    (data.reason === "profile_unavailable" ||
      data.reason === "preparation_not_approved")
  ) {
    return { status: "unsupported", reason: data.reason };
  }

  return { status: "unsupported", reason: "profile_unavailable" };
}
