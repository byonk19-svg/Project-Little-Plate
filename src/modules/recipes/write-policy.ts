import type { NormalizedRecipe } from "@/modules/recipes/domain";

export type RecipeRecord = {
  household_id: string;
  title: string;
  description: string | null;
  ingredients: string;
  instructions: string;
  prep_minutes: number | null;
  cook_minutes: number | null;
  servings: number | null;
  notes: string | null;
  source_url: string | null;
  source_title: string | null;
  source_type: "manual" | "imported";
  import_status: "confirmed";
  tags: string[];
  is_favorite: boolean;
};

export function buildRecipeRecord(
  recipe: NormalizedRecipe,
  householdId: string
): RecipeRecord {
  return {
    household_id: householdId,
    title: recipe.title,
    description: recipe.description,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    prep_minutes: recipe.prepMinutes,
    cook_minutes: recipe.cookMinutes,
    servings: recipe.servings,
    notes: recipe.notes,
    source_url: recipe.sourceUrl,
    source_title: recipe.sourceTitle,
    source_type: recipe.sourceUrl ? "imported" : "manual",
    import_status: "confirmed",
    tags: recipe.tags,
    is_favorite: recipe.favorite
  };
}
