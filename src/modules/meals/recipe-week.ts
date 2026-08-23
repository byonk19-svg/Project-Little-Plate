import { getHouseholdContext } from "@/modules/household/server";
import {
  getCurrentIsoDate,
  getWeekDates,
  selectNextPlannedSlot,
  type RecipeMealSlot,
  type RecipeSlotStatus
} from "@/modules/meals/recipe-week-domain";
import { getRecipes, type Recipe } from "@/modules/recipes/queries";

export type RecipeWeekSlot = {
  id: string;
  localDate: string;
  mealSlot: RecipeMealSlot;
  status: RecipeSlotStatus;
  note: string | null;
  recipe: Pick<
    Recipe,
    "id" | "title" | "description" | "sourceTitle" | "sourceUrl" | "sourceType"
  >;
};

export type RecipeWeek = {
  windowStart: string;
  windowEnd: string;
  days: Array<{
    localDate: string;
    slots: Array<{
      mealSlot: RecipeMealSlot;
      slot: RecipeWeekSlot | null;
    }>;
  }>;
};

const mealSlots: RecipeMealSlot[] = ["breakfast", "lunch", "dinner"];
const recipeSelect =
  "id, local_date, meal_slot, status, note, recipe_id, recipe:recipes!recipe_week_slots_recipe_household_fk(id, title, description, source_title, source_url, source_type)";

function validDate(value: string | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function mapSlot(value: unknown): RecipeWeekSlot | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const recipe = row.recipe;
  if (!recipe || typeof recipe !== "object") return null;
  const recipeRow = recipe as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.local_date !== "string" ||
    (row.meal_slot !== "breakfast" &&
      row.meal_slot !== "lunch" &&
      row.meal_slot !== "dinner") ||
    (row.status !== "planned" &&
      row.status !== "skipped" &&
      row.status !== "completed") ||
    typeof recipeRow.id !== "string" ||
    typeof recipeRow.title !== "string"
  ) {
    return null;
  }

  return {
    id: row.id,
    localDate: row.local_date,
    mealSlot: row.meal_slot,
    status: row.status,
    note: typeof row.note === "string" ? row.note : null,
    recipe: {
      id: recipeRow.id,
      title: recipeRow.title,
      description:
        typeof recipeRow.description === "string"
          ? recipeRow.description
          : null,
      sourceTitle:
        typeof recipeRow.source_title === "string"
          ? recipeRow.source_title
          : null,
      sourceUrl:
        typeof recipeRow.source_url === "string" ? recipeRow.source_url : null,
      sourceType: recipeRow.source_type === "imported" ? "imported" : "manual"
    }
  };
}

export async function getRecipeWeek(
  windowStart?: string
): Promise<
  | { status: "ready"; week: RecipeWeek }
  | { status: "signed_out"; week: null }
  | { status: "unavailable"; week: null }
> {
  const context = await getHouseholdContext();
  if (context.status === "signed_out")
    return { status: "signed_out", week: null };
  if (context.status !== "authenticated")
    return { status: "unavailable", week: null };
  const { supabase } = context;

  const start = validDate(windowStart) ? windowStart : getCurrentIsoDate();
  const dates = getWeekDates(start);
  const result = await supabase
    .from("recipe_week_slots")
    .select(recipeSelect)
    .gte("local_date", dates[0])
    .lte("local_date", dates[dates.length - 1])
    .order("local_date")
    .order("meal_slot");

  if (result.error) return { status: "unavailable", week: null };

  const slots = result.data
    .map(mapSlot)
    .filter((slot): slot is RecipeWeekSlot => slot !== null);

  return {
    status: "ready",
    week: {
      windowStart: dates[0],
      windowEnd: dates[dates.length - 1],
      days: dates.map((localDate) => ({
        localDate,
        slots: mealSlots.map((mealSlot) => ({
          mealSlot,
          slot:
            slots.find(
              (candidate) =>
                candidate.localDate === localDate &&
                candidate.mealSlot === mealSlot
            ) ?? null
        }))
      }))
    }
  };
}

export async function getNextPlannedRecipe(): Promise<
  | { status: "ready"; slot: RecipeWeekSlot }
  | { status: "signed_out" | "empty" | "unavailable"; slot: null }
> {
  const context = await getHouseholdContext();
  if (context.status === "signed_out")
    return { status: "signed_out", slot: null };
  if (context.status !== "authenticated")
    return { status: "unavailable", slot: null };
  const { supabase } = context;

  const result = await supabase
    .from("recipe_week_slots")
    .select(recipeSelect)
    .eq("status", "planned")
    .gte("local_date", getCurrentIsoDate())
    .order("local_date")
    .limit(30);
  if (result.error) return { status: "unavailable", slot: null };

  const slots = result.data
    .map(mapSlot)
    .filter((slot): slot is RecipeWeekSlot => slot !== null);
  const next = selectNextPlannedSlot(slots, getCurrentIsoDate());
  return next
    ? { status: "ready", slot: next }
    : { status: "empty", slot: null };
}

export async function getRecipePlanningOptions(): Promise<Recipe[]> {
  const result = await getRecipes();
  return result.status === "ready" ? result.recipes : [];
}
