import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isJsonRecord, type JsonRecord } from "@/modules/meals/transport";

type SupportingMeal = {
  componentId: string;
  mealId: string;
  localDate: string;
  mealSlot: string;
};

export type DerivedWork = {
  babyId: string;
  timeZone: string;
  windowStart: string;
  planVersion: number;
  preparationTasks: Array<{
    preparationId: string;
    preparationName: string;
    neededPortions: number;
    taskFingerprint: string;
    seedComponentId: string;
    supportingMeals: SupportingMeal[];
  }>;
  derivedGroceryItems: Array<{
    foodId: string;
    foodName: string;
    storeSection: string;
    neededPortions: number;
    alreadyHave: boolean;
    checked: boolean;
  }>;
  manualGroceryItems: Array<{
    id: string;
    name: string;
    storeSection: string;
    quantity: number;
    checked: boolean;
  }>;
};

function stringValue(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value !== "" ? value : null;
}

function positiveInteger(record: JsonRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function parseSupportingMeal(value: unknown): SupportingMeal | null {
  if (!isJsonRecord(value)) return null;
  const componentId = stringValue(value, "component_id");
  const mealId = stringValue(value, "meal_id");
  const localDate = stringValue(value, "local_date");
  const mealSlot = stringValue(value, "meal_slot");
  return componentId && mealId && localDate && mealSlot
    ? { componentId, mealId, localDate, mealSlot }
    : null;
}

export function parseDerivedWork(value: unknown): DerivedWork | null {
  if (
    !isJsonRecord(value) ||
    value.status !== "ready" ||
    !Array.isArray(value.preparation_tasks) ||
    !Array.isArray(value.derived_grocery_items) ||
    !Array.isArray(value.manual_grocery_items)
  ) {
    return null;
  }
  const babyId = stringValue(value, "baby_id");
  const timeZone = stringValue(value, "time_zone");
  const windowStart = stringValue(value, "window_start");
  const planVersion = value.plan_version;
  if (
    !babyId ||
    !timeZone ||
    !windowStart ||
    typeof planVersion !== "number" ||
    !Number.isInteger(planVersion) ||
    planVersion < 0
  ) {
    return null;
  }

  const preparationTasks = value.preparation_tasks.map((item) => {
    if (!isJsonRecord(item) || !Array.isArray(item.supporting_meals)) {
      return null;
    }
    const preparationId = stringValue(item, "preparation_id");
    const preparationName = stringValue(item, "preparation_name");
    const neededPortions = positiveInteger(item, "needed_portions");
    const taskFingerprint = stringValue(item, "task_fingerprint");
    const seedComponentId = stringValue(item, "seed_component_id");
    const supportingMeals = item.supporting_meals.map(parseSupportingMeal);
    return preparationId &&
      preparationName &&
      neededPortions &&
      taskFingerprint &&
      seedComponentId &&
      supportingMeals.length > 0 &&
      supportingMeals.every((meal) => meal !== null)
      ? {
          preparationId,
          preparationName,
          neededPortions,
          taskFingerprint,
          seedComponentId,
          supportingMeals: supportingMeals as SupportingMeal[]
        }
      : null;
  });
  const derivedGroceryItems = value.derived_grocery_items.map((item) => {
    if (!isJsonRecord(item)) return null;
    const foodId = stringValue(item, "food_id");
    const foodName = stringValue(item, "food_name");
    const storeSection = stringValue(item, "store_section");
    const neededPortions = positiveInteger(item, "needed_portions");
    return foodId &&
      foodName &&
      storeSection &&
      neededPortions &&
      typeof item.already_have === "boolean" &&
      typeof item.is_checked === "boolean"
      ? {
          foodId,
          foodName,
          storeSection,
          neededPortions,
          alreadyHave: item.already_have,
          checked: item.is_checked
        }
      : null;
  });
  const manualGroceryItems = value.manual_grocery_items.map((item) => {
    if (!isJsonRecord(item)) return null;
    const id = stringValue(item, "id");
    const name = stringValue(item, "name");
    const storeSection = stringValue(item, "store_section");
    const quantity = positiveInteger(item, "quantity");
    return id &&
      name &&
      storeSection &&
      quantity &&
      typeof item.is_checked === "boolean"
      ? { id, name, storeSection, quantity, checked: item.is_checked }
      : null;
  });

  return preparationTasks.every((item) => item !== null) &&
    derivedGroceryItems.every((item) => item !== null) &&
    manualGroceryItems.every((item) => item !== null)
    ? {
        babyId,
        timeZone,
        windowStart,
        planVersion,
        preparationTasks: preparationTasks as DerivedWork["preparationTasks"],
        derivedGroceryItems:
          derivedGroceryItems as DerivedWork["derivedGroceryItems"],
        manualGroceryItems:
          manualGroceryItems as DerivedWork["manualGroceryItems"]
      }
    : null;
}

export async function getDerivedWork(): Promise<DerivedWork | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_derived_work_and_groceries");
  return error ? null : parseDerivedWork(data);
}
