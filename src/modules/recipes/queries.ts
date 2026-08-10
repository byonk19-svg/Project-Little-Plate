import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isJsonRecord, type JsonRecord } from "@/modules/meals/transport";

export type PersonalRecipe = {
  id: string;
  householdId: string;
  title: string;
  ingredients: string;
  instructions: string;
  notes: string;
  sourceUrl: string | null;
  sourceType: "manual" | "recipe_url";
  extractionMethod: "json_ld" | "itemprop" | "metadata_preview" | "manual";
  updatedAt: string;
};

export type PersonalPlanningItem = {
  id: string;
  recipeId: string;
  babyId: string;
  localDate: string;
  mealSlot: "breakfast" | "lunch" | "dinner";
  title: string;
  ingredients: string;
  instructions: string;
  sourceUrl: string | null;
  label: "Personal recipe — not reviewed";
};

export type PersonalRecipesResult =
  | { status: "ready"; items: PersonalRecipe[] }
  | { status: "unavailable"; items: [] };

export type PersonalRecipeResult =
  | { status: "ready"; recipe: PersonalRecipe }
  | { status: "unavailable"; recipe: null };

export type PersonalPlanningItemsResult =
  | { status: "ready"; items: PersonalPlanningItem[] }
  | { status: "unavailable"; items: [] };

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function nullableString(value: unknown): string | null {
  return value === null || typeof value === "string" ? value : null;
}

function parseRecipe(value: unknown): PersonalRecipe | null {
  if (!isJsonRecord(value)) {
    return null;
  }
  const id = nonEmptyString(value.id);
  const householdId = nonEmptyString(value.household_id);
  const title = nonEmptyString(value.title);
  const ingredients = nonEmptyString(value.ingredients);
  const instructions = nonEmptyString(value.instructions);
  const notes = typeof value.notes === "string" ? value.notes : null;
  const sourceUrl = nullableString(value.source_url);
  const sourceType = value.source_type;
  const extractionMethod = value.extraction_method;
  const updatedAt = nonEmptyString(value.updated_at);

  return id &&
    householdId &&
    title &&
    ingredients &&
    instructions &&
    notes !== null &&
    (sourceType === "manual" || sourceType === "recipe_url") &&
    (extractionMethod === "json_ld" ||
      extractionMethod === "itemprop" ||
      extractionMethod === "metadata_preview" ||
      extractionMethod === "manual") &&
    updatedAt
    ? {
        id,
        householdId,
        title,
        ingredients,
        instructions,
        notes,
        sourceUrl,
        sourceType,
        extractionMethod,
        updatedAt
      }
    : null;
}

export function parsePersonalPlanningItem(
  value: unknown
): PersonalPlanningItem | null {
  if (!isJsonRecord(value)) {
    return null;
  }
  const id = nonEmptyString(value.id);
  const recipeId = nonEmptyString(value.recipe_id);
  const babyId = nonEmptyString(value.baby_id);
  const localDate = nonEmptyString(value.local_date);
  const mealSlot = value.meal_slot;
  const title = nonEmptyString(value.title);
  const ingredients = nonEmptyString(value.ingredients);
  const instructions = nonEmptyString(value.instructions);
  const sourceUrl = nullableString(value.source_url);

  return id &&
    recipeId &&
    babyId &&
    localDate &&
    title &&
    ingredients &&
    instructions &&
    sourceUrl !== undefined &&
    (mealSlot === "breakfast" ||
      mealSlot === "lunch" ||
      mealSlot === "dinner") &&
    value.label === "Personal recipe — not reviewed"
    ? {
        id,
        recipeId,
        babyId,
        localDate,
        mealSlot,
        title,
        ingredients,
        instructions,
        sourceUrl,
        label: "Personal recipe — not reviewed"
      }
    : null;
}

function parseArray(data: unknown): unknown[] | null {
  return Array.isArray(data) ? data : null;
}

export async function getPersonalRecipes(): Promise<PersonalRecipesResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_personal_recipes");
  const values = error ? null : parseArray(data);
  if (!values) {
    return { status: "unavailable", items: [] };
  }
  const items = values.map(parseRecipe);
  return items.every((item) => item !== null)
    ? { status: "ready", items: items as PersonalRecipe[] }
    : { status: "unavailable", items: [] };
}

export async function getPersonalRecipe(
  recipeId: string
): Promise<PersonalRecipeResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_personal_recipe", {
    p_recipe_id: recipeId
  });
  const recipe = error ? null : parseRecipe(data);
  return recipe
    ? { status: "ready", recipe }
    : { status: "unavailable", recipe: null };
}

export async function getPersonalPlanningItems(
  windowStart?: string
): Promise<PersonalPlanningItemsResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_personal_planning_items", {
    p_window_start: windowStart ?? null
  });
  const values = error ? null : parseArray(data);
  if (!values) {
    return { status: "unavailable", items: [] };
  }
  const items = values.map(parsePersonalPlanningItem);
  return items.every((item) => item !== null)
    ? { status: "ready", items: items as PersonalPlanningItem[] }
    : { status: "unavailable", items: [] };
}

export function recipeToDraft(recipe: PersonalRecipe): JsonRecord {
  return {
    title: recipe.title,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    notes: recipe.notes,
    sourceUrl: recipe.sourceUrl ?? "",
    sourceType: recipe.sourceType,
    extractionMethod: recipe.extractionMethod
  };
}
