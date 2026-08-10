"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  normalizePersonalRecipeDraft,
  type PersonalRecipeDraft
} from "@/modules/recipes/domain";
import type {
  PersonalPlanningFormState,
  RecipeFormState
} from "@/modules/recipes/form-state";
import { isJsonRecord } from "@/modules/meals/transport";

function formDraft(formData: FormData): PersonalRecipeDraft {
  const sourceType = String(formData.get("sourceType") ?? "manual");
  const extractionMethod = String(formData.get("extractionMethod") ?? "manual");
  return {
    title: String(formData.get("title") ?? ""),
    ingredients: String(formData.get("ingredients") ?? ""),
    instructions: String(formData.get("instructions") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    sourceUrl: String(formData.get("sourceUrl") ?? ""),
    sourceType: sourceType as PersonalRecipeDraft["sourceType"],
    extractionMethod:
      extractionMethod as PersonalRecipeDraft["extractionMethod"]
  };
}

export async function savePersonalRecipe(
  _previousState: RecipeFormState,
  formData: FormData
): Promise<RecipeFormState> {
  const draft = formDraft(formData);
  const normalized = normalizePersonalRecipeDraft(draft);
  if (normalized.status === "invalid") {
    return {
      status: "error",
      message:
        Object.values(normalized.errors)[0] ?? "Review the recipe fields."
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims) {
    redirect("/login");
  }

  const recipeId = String(formData.get("recipeId") ?? "");
  const rpc = recipeId ? "update_personal_recipe" : "create_personal_recipe";
  const payload = recipeId
    ? {
        p_recipe_id: recipeId,
        p_title: normalized.recipe.title,
        p_ingredients: normalized.recipe.ingredients,
        p_instructions: normalized.recipe.instructions,
        p_notes: normalized.recipe.notes,
        p_source_url: normalized.recipe.sourceUrl,
        p_source_type: normalized.recipe.sourceType,
        p_extraction_method: normalized.recipe.extractionMethod
      }
    : {
        p_title: normalized.recipe.title,
        p_ingredients: normalized.recipe.ingredients,
        p_instructions: normalized.recipe.instructions,
        p_notes: normalized.recipe.notes,
        p_source_url: normalized.recipe.sourceUrl,
        p_source_type: normalized.recipe.sourceType,
        p_extraction_method: normalized.recipe.extractionMethod
      };
  const { data, error } = await supabase.rpc(rpc, payload);
  const savedId =
    isJsonRecord(data) && typeof data.id === "string" ? data.id : null;
  if (error || !savedId) {
    return {
      status: "error",
      message: "The recipe could not be saved. Review the fields and try again."
    };
  }

  revalidatePath("/recipes");
  redirect(`/recipes/${savedId}`);
}

export async function deletePersonalRecipe(recipeId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims) {
    redirect("/login");
  }
  await supabase.rpc("delete_personal_recipe", { p_recipe_id: recipeId });
  revalidatePath("/recipes");
  revalidatePath("/week");
  redirect("/recipes");
}

export async function deletePersonalRecipeAction(
  formData: FormData
): Promise<void> {
  await deletePersonalRecipe(String(formData.get("recipeId") ?? ""));
}

export async function planPersonalRecipe(
  _previousState: PersonalPlanningFormState,
  formData: FormData
): Promise<PersonalPlanningFormState> {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims) {
    redirect("/login");
  }
  const { data, error } = await supabase.rpc("plan_personal_recipe", {
    p_baby_id: String(formData.get("babyId") ?? ""),
    p_recipe_id: String(formData.get("recipeId") ?? ""),
    p_local_date: String(formData.get("localDate") ?? ""),
    p_meal_slot: String(formData.get("mealSlot") ?? "")
  });
  if (error || !isJsonRecord(data) || data.status !== "planned") {
    return {
      status: "error",
      message:
        "That recipe could not be added to the week. Refresh and try again."
    };
  }
  revalidatePath("/week");
  redirect("/week?planned=personal");
}
