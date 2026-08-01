import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isJsonRecord, type JsonRecord } from "@/modules/meals/transport";

export type MealSlot = "breakfast" | "lunch" | "dinner";

export type WeekComponent = {
  componentId: string;
  position: number;
  preparationId: string;
  revisionId: string;
  preparationSlug: string;
  preparationName: string;
  foodName: string;
  availabilityState: "eligible" | "replacement_required";
  unavailableReason: string | null;
  isLocked: boolean;
  isQuickBackup: boolean;
  servingStatus: "planned" | "served";
};

export type WeekPlan = {
  babyId: string;
  planId: string | null;
  version: number;
  timeZone: string;
  windowStart: string;
  windowEnd: string;
  varietySummary: {
    plannedMeals: number;
    distinctFoods: number;
    copy: string;
  };
  days: Array<{
    localDate: string;
    slots: Array<{
      mealId: string | null;
      mealSlot: MealSlot;
      status: "planned" | "skipped" | "completed";
      isLocked: boolean;
      components: WeekComponent[];
    }>;
  }>;
};

export type WeekPlanResult =
  { status: "ready"; plan: WeekPlan } | { status: "unavailable"; plan: null };

export type WeekEditOption = {
  preparationSlug: string;
  preparationName: string;
  foodName: string;
  isQuickBackup: boolean;
};

export type WeekEditOptionsResult =
  | { status: "ready"; items: WeekEditOption[] }
  | { status: "unavailable"; items: [] };

const mealSlots = new Set<MealSlot>(["breakfast", "lunch", "dinner"]);
const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function requiredString(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value !== "" ? value : null;
}

function parseComponent(value: unknown): WeekComponent | null {
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
  const hasUnavailableReason = Object.prototype.hasOwnProperty.call(
    value,
    "unavailable_reason"
  );
  const unavailableReason =
    value.unavailable_reason === null
      ? null
      : requiredString(value, "unavailable_reason");
  const servingStatus = value.serving_status;
  const position = value.position;

  return componentId &&
    preparationId &&
    revisionId &&
    preparationSlug &&
    preparationName &&
    foodName &&
    (availabilityState === "eligible" ||
      availabilityState === "replacement_required") &&
    ((availabilityState === "eligible" &&
      hasUnavailableReason &&
      value.unavailable_reason === null) ||
      (availabilityState === "replacement_required" &&
        unavailableReason !== null)) &&
    typeof value.is_locked === "boolean" &&
    typeof value.is_quick_backup === "boolean" &&
    (servingStatus === "planned" || servingStatus === "served") &&
    typeof position === "number" &&
    Number.isInteger(position) &&
    position >= 1 &&
    position <= 3
    ? {
        componentId,
        position,
        preparationId,
        revisionId,
        preparationSlug,
        preparationName,
        foodName,
        availabilityState,
        unavailableReason,
        isLocked: value.is_locked,
        isQuickBackup: value.is_quick_backup,
        servingStatus
      }
    : null;
}

export function parseWeekPlan(value: unknown): WeekPlan | null {
  if (
    !isJsonRecord(value) ||
    value.status !== "ready" ||
    !Array.isArray(value.days)
  ) {
    return null;
  }

  const babyId = requiredString(value, "baby_id");
  const planId =
    value.plan_id === null ? null : requiredString(value, "plan_id");
  const version = value.version;
  const timeZone = requiredString(value, "time_zone");
  const windowStart = requiredString(value, "window_start");
  const windowEnd = requiredString(value, "window_end");
  const varietySummary = value.variety_summary;

  const days = value.days.map((day) => {
    if (!isJsonRecord(day) || !Array.isArray(day.slots)) {
      return null;
    }

    const localDate = requiredString(day, "local_date");
    const slots = day.slots.map((slot) => {
      if (!isJsonRecord(slot) || !Array.isArray(slot.components)) {
        return null;
      }

      const mealId =
        slot.meal_id === null ? null : requiredString(slot, "meal_id");
      const mealSlot = slot.meal_slot;
      const status = slot.status;
      const components = slot.components.map(parseComponent);
      return typeof mealSlot === "string" &&
        mealSlots.has(mealSlot as MealSlot) &&
        (status === "planned" ||
          status === "skipped" ||
          status === "completed") &&
        typeof slot.is_locked === "boolean" &&
        components.length <= 3 &&
        components.every((component) => component !== null)
        ? {
            mealId,
            mealSlot: mealSlot as MealSlot,
            status,
            isLocked: slot.is_locked,
            components: components as WeekComponent[]
          }
        : null;
    });

    return localDate &&
      localDatePattern.test(localDate) &&
      slots.length >= 1 &&
      slots.length <= 3 &&
      slots.every((slot) => slot !== null)
      ? {
          localDate,
          slots: slots as WeekPlan["days"][number]["slots"]
        }
      : null;
  });

  if (
    !babyId ||
    (planId === null && version !== 0) ||
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 0 ||
    !timeZone ||
    !windowStart ||
    !windowEnd ||
    !localDatePattern.test(windowStart) ||
    !localDatePattern.test(windowEnd) ||
    !isJsonRecord(varietySummary) ||
    typeof varietySummary.planned_meals !== "number" ||
    !Number.isInteger(varietySummary.planned_meals) ||
    varietySummary.planned_meals < 0 ||
    typeof varietySummary.distinct_foods !== "number" ||
    !Number.isInteger(varietySummary.distinct_foods) ||
    varietySummary.distinct_foods < 0 ||
    typeof varietySummary.copy !== "string" ||
    varietySummary.copy === "" ||
    days.length !== 7 ||
    !days.every((day) => day !== null)
  ) {
    return null;
  }

  const parsedDays = days as WeekPlan["days"];
  const configuredSlots = parsedDays[0]?.slots.map((slot) => slot.mealSlot);
  const hasConsistentSlots =
    configuredSlots !== undefined &&
    parsedDays.every(
      (day) =>
        day.slots.map((slot) => slot.mealSlot).join(",") ===
        configuredSlots.join(",")
    );

  return hasConsistentSlots
    ? {
        babyId,
        planId,
        version,
        timeZone,
        windowStart,
        windowEnd,
        varietySummary: {
          plannedMeals: varietySummary.planned_meals,
          distinctFoods: varietySummary.distinct_foods,
          copy: varietySummary.copy
        },
        days: parsedDays
      }
    : null;
}

function parseEditOption(value: unknown): WeekEditOption | null {
  if (!isJsonRecord(value)) {
    return null;
  }

  const preparationSlug = requiredString(value, "preparation_slug");
  const preparationName = requiredString(value, "preparation_name");
  const foodName = requiredString(value, "food_name");

  return preparationSlug &&
    preparationName &&
    foodName &&
    typeof value.is_quick_backup === "boolean"
    ? {
        preparationSlug,
        preparationName,
        foodName,
        isQuickBackup: value.is_quick_backup
      }
    : null;
}

export async function getCurrentWeek(
  windowStart?: string
): Promise<WeekPlanResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_week_window", {
    p_window_start:
      windowStart && localDatePattern.test(windowStart) ? windowStart : null
  });
  const plan = error ? null : parseWeekPlan(data);

  return plan
    ? { status: "ready", plan }
    : { status: "unavailable", plan: null };
}

export async function getWeekEditOptions(): Promise<WeekEditOptionsResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_week_edit_options");

  if (
    error ||
    !isJsonRecord(data) ||
    data.status !== "ready" ||
    !Array.isArray(data.items)
  ) {
    return { status: "unavailable", items: [] };
  }

  const items = data.items.map(parseEditOption);
  return items.every((item) => item !== null)
    ? { status: "ready", items: items as WeekEditOption[] }
    : { status: "unavailable", items: [] };
}
