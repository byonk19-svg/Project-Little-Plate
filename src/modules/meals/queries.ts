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
  servingStatus: "planned" | "served";
};

export type WeekPlan = {
  babyId: string;
  timeZone: string;
  windowStart: string;
  windowEnd: string;
  days: Array<{
    localDate: string;
    slots: Array<{
      mealSlot: MealSlot;
      components: WeekComponent[];
    }>;
  }>;
};

export type WeekPlanResult =
  { status: "ready"; plan: WeekPlan } | { status: "unavailable"; plan: null };

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
  const servingStatus = value.serving_status;
  const position = value.position;

  return componentId &&
    preparationId &&
    revisionId &&
    preparationSlug &&
    preparationName &&
    foodName &&
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
        servingStatus
      }
    : null;
}

function parseWeekPlan(value: unknown): WeekPlan | null {
  if (
    !isJsonRecord(value) ||
    value.status !== "ready" ||
    !Array.isArray(value.days)
  ) {
    return null;
  }

  const babyId = requiredString(value, "baby_id");
  const timeZone = requiredString(value, "time_zone");
  const windowStart = requiredString(value, "window_start");
  const windowEnd = requiredString(value, "window_end");

  const days = value.days.map((day) => {
    if (!isJsonRecord(day) || !Array.isArray(day.slots)) {
      return null;
    }

    const localDate = requiredString(day, "local_date");
    const slots = day.slots.map((slot) => {
      if (!isJsonRecord(slot) || !Array.isArray(slot.components)) {
        return null;
      }

      const mealSlot = slot.meal_slot;
      const components = slot.components.map(parseComponent);
      return typeof mealSlot === "string" &&
        mealSlots.has(mealSlot as MealSlot) &&
        components.length <= 3 &&
        components.every((component) => component !== null)
        ? {
            mealSlot: mealSlot as MealSlot,
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
    !timeZone ||
    !windowStart ||
    !windowEnd ||
    !localDatePattern.test(windowStart) ||
    !localDatePattern.test(windowEnd) ||
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
    ? { babyId, timeZone, windowStart, windowEnd, days: parsedDays }
    : null;
}

export async function getCurrentWeek(): Promise<WeekPlanResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_current_week");
  const plan = error ? null : parseWeekPlan(data);

  return plan
    ? { status: "ready", plan }
    : { status: "unavailable", plan: null };
}
