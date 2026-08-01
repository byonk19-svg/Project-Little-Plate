import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isJsonRecord, type JsonRecord } from "@/modules/meals/transport";

export type TodayAvailabilityState =
  "ready" | "quick_preparation" | "thaw_required" | "served" | "unavailable";

export type TodayComponent = {
  componentId: string;
  preparationId: string;
  revisionId: string;
  preparationSlug: string;
  preparationName: string;
  foodName: string;
  availabilityState: TodayAvailabilityState;
  unavailableReason: string | null;
  batchId: string | null;
  remainingPortions: number | null;
  deadlineAt: string | null;
  guidance: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  reviewedAt: string | null;
};

export type TodayMealResult =
  | {
      status: "ready";
      babyId: string;
      timeZone: string;
      localDate: string;
      mealSlot: "breakfast" | "lunch" | "dinner";
      components: TodayComponent[];
    }
  | {
      status: "empty";
      reason: string;
    }
  | {
      status: "unavailable";
      reason: string;
    };

const availabilityStates = new Set<TodayAvailabilityState>([
  "ready",
  "quick_preparation",
  "thaw_required",
  "served",
  "unavailable"
]);
const mealSlots = new Set(["breakfast", "lunch", "dinner"]);

function nullableString(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return value === null
    ? null
    : typeof value === "string" && value !== ""
      ? value
      : null;
}

function requiredString(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value !== "" ? value : null;
}

function parseComponent(value: unknown): TodayComponent | null {
  if (!isJsonRecord(value)) {
    return null;
  }

  const componentId = requiredString(value, "component_id");
  const preparationId = requiredString(value, "preparation_id");
  const revisionId = requiredString(value, "revision_id");
  const preparationSlug = requiredString(value, "preparation_slug");
  const preparationName = requiredString(value, "preparation_name");
  const foodName = requiredString(value, "food_name");
  const availabilityState = value.availability_state;
  const unavailableReason = nullableString(value, "unavailable_reason");
  const batchId = nullableString(value, "batch_id");
  const deadlineAt = nullableString(value, "deadline_at");
  const guidance = nullableString(value, "guidance");
  const sourceTitle = nullableString(value, "source_title");
  const sourceUrl = nullableString(value, "source_url");
  const reviewedAt = nullableString(value, "reviewed_at");
  const remainingPortions = value.remaining_portions;

  if (
    !componentId ||
    !preparationId ||
    !revisionId ||
    !preparationSlug ||
    !preparationName ||
    !foodName ||
    typeof availabilityState !== "string" ||
    !availabilityStates.has(availabilityState as TodayAvailabilityState) ||
    !(
      remainingPortions === null ||
      (typeof remainingPortions === "number" &&
        Number.isSafeInteger(remainingPortions) &&
        remainingPortions >= 0)
    )
  ) {
    return null;
  }

  if (
    availabilityState === "ready" &&
    (!batchId ||
      remainingPortions === null ||
      remainingPortions <= 0 ||
      !deadlineAt ||
      !guidance ||
      !sourceTitle ||
      !sourceUrl ||
      !reviewedAt)
  ) {
    return null;
  }

  return {
    componentId,
    preparationId,
    revisionId,
    preparationSlug,
    preparationName,
    foodName,
    availabilityState: availabilityState as TodayAvailabilityState,
    unavailableReason,
    batchId,
    remainingPortions: remainingPortions as number | null,
    deadlineAt,
    guidance,
    sourceTitle,
    sourceUrl,
    reviewedAt
  };
}

export async function getTodayMeal(): Promise<TodayMealResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_today_meal");

  if (error || !isJsonRecord(data)) {
    return { status: "unavailable", reason: "today_unavailable" };
  }

  if (data.status === "empty") {
    return { status: "empty", reason: "no_planned_meal" };
  }

  if (data.status !== "ready" || !Array.isArray(data.components)) {
    return {
      status: "unavailable",
      reason:
        typeof data.reason === "string" ? data.reason : "today_unavailable"
    };
  }

  const babyId = requiredString(data, "baby_id");
  const timeZone = requiredString(data, "time_zone");
  const localDate = requiredString(data, "local_date");
  const mealSlot = data.meal_slot;
  const components = data.components.map(parseComponent);

  return babyId &&
    timeZone &&
    localDate &&
    typeof mealSlot === "string" &&
    mealSlots.has(mealSlot) &&
    components.length > 0 &&
    components.every((component) => component !== null)
    ? {
        status: "ready",
        babyId,
        timeZone,
        localDate,
        mealSlot: mealSlot as "breakfast" | "lunch" | "dinner",
        components: components as TodayComponent[]
      }
    : { status: "unavailable", reason: "today_invalid" };
}
