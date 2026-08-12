"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getHouseholdContext } from "@/modules/household/server";
import { normalizeExternalImageUrl } from "@/modules/recipe-images/domain";
import { findRecipeImportMatches } from "@/modules/recipe-import/duplicates";
import {
  normalizeRecipeInput,
  type RecipeInput
} from "@/modules/recipes/domain";
import type { RecipeFormState } from "@/modules/recipes/form-state";
import type { RecipeImportSaveFormState } from "@/modules/recipe-import/form-state";
import { selectReviewedImportDrafts } from "@/modules/recipe-import/workflow";
import { buildRecipeRecord } from "@/modules/recipes/write-policy";

function readRecipeInput(formData: FormData, prefix = ""): RecipeInput {
  const value = (name: string) =>
    String(formData.get(`${prefix}${name}`) ?? "");
  return {
    title: value("title"),
    description: value("description"),
    ingredients: value("ingredients"),
    instructions: value("instructions"),
    prepMinutes: value("prepMinutes"),
    cookMinutes: value("cookMinutes"),
    servings: value("servings"),
    notes: value("notes"),
    sourceUrl: value("sourceUrl"),
    sourceTitle: value("sourceTitle"),
    tags: value("tags"),
    favorite: formData.get(`${prefix}favorite`) === "on"
  };
}

async function getHouseholdClient() {
  const context = await getHouseholdContext();
  if (context.status === "signed_out") redirect("/login");
  return context.status === "authenticated" ? context : null;
}

function databaseErrorState(message: string): RecipeFormState {
  return { status: "error", message };
}

function readConfirmedImage(
  formData: FormData,
  prefix = ""
): { url: string; altText: string } | { error: string } | null {
  if (formData.get(`${prefix}useSuggestedImage`) !== "on") return null;

  const altText = String(
    formData.get(`${prefix}suggestedImageAlt`) ?? ""
  ).trim();
  if (!altText || altText.length > 240) {
    return { error: "Add a short description for the selected image." };
  }

  try {
    return {
      url: normalizeExternalImageUrl(
        String(formData.get(`${prefix}suggestedImageUrl`) ?? "")
      ),
      altText
    };
  } catch {
    return { error: "The selected image URL is not valid." };
  }
}

async function saveConfirmedImage(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  householdId: string,
  recipeId: string,
  image: { url: string; altText: string },
  sourceUrl: string | null
): Promise<boolean> {
  const result = await supabase.from("recipe_images").insert({
    household_id: householdId,
    recipe_id: recipeId,
    source_type: "external",
    external_url: image.url,
    alt_text: image.altText,
    source_url: sourceUrl
  });
  return !result.error;
}

async function existingRecipeMatches(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  sourceUrl: string | null
) {
  if (!sourceUrl) return [];
  const result = await supabase
    .from("recipes")
    .select("id, title, source_url")
    .not("source_url", "is", null);
  if (result.error || !result.data) return [];

  return findRecipeImportMatches(
    sourceUrl,
    result.data.map((recipe) => ({
      id: recipe.id,
      title: recipe.title,
      sourceUrl: recipe.source_url
    }))
  );
}

export async function createRecipe(
  _previousState: RecipeFormState,
  formData: FormData
): Promise<RecipeFormState> {
  const normalized = normalizeRecipeInput(readRecipeInput(formData));
  if (!normalized.ok) {
    return {
      status: "error",
      message: "Check the highlighted recipe fields.",
      fieldErrors: normalized.errors
    };
  }

  const context = await getHouseholdClient();
  if (!context) {
    return databaseErrorState(
      "Finish account setup before saving your first recipe."
    );
  }

  const image = readConfirmedImage(formData);
  if (image && "error" in image) return databaseErrorState(image.error);

  if (formData.has("knownDuplicate")) {
    const duplicateMatches = await existingRecipeMatches(
      context.supabase,
      normalized.value.sourceUrl
    );
    const knownDuplicate = formData.get("knownDuplicate") === "1";
    if (duplicateMatches.length > 0 && !knownDuplicate) {
      return databaseErrorState(
        "This source was saved while the form was open. Review the import again before saving."
      );
    }
    if (
      duplicateMatches.length > 0 &&
      formData.get("allowDuplicate") !== "on"
    ) {
      return databaseErrorState(
        "This recipe is already saved. Open the existing recipe or choose Import as a separate copy."
      );
    }
  }

  const { data, error } = await context.supabase
    .from("recipes")
    .insert(buildRecipeRecord(normalized.value, context.householdId))
    .select("id")
    .single();

  if (error || !data?.id) {
    return databaseErrorState(
      "The recipe could not be saved. Check the fields and try again."
    );
  }

  if (image && !("error" in image)) {
    const imageSaved = await saveConfirmedImage(
      context.supabase,
      context.householdId,
      data.id,
      image,
      normalized.value.sourceUrl
    );
    if (!imageSaved) {
      await context.supabase.from("recipes").delete().eq("id", data.id);
      return databaseErrorState(
        "The recipe could not save its selected image. Try again or leave the image unchecked."
      );
    }
  }

  revalidatePath("/recipes");
  redirect(`/recipes/${data.id}?created=1`);
}

export async function saveImportedRecipes(
  _previousState: RecipeImportSaveFormState,
  formData: FormData
): Promise<RecipeImportSaveFormState> {
  const selected = formData
    .getAll("selected")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0);
  const reviewedSelection = selectReviewedImportDrafts(
    selected.map((index) => ({
      index,
      knownDuplicate: formData.get(`recipe_${index}_knownDuplicate`) === "1",
      allowDuplicate: true
    }))
  );
  if (reviewedSelection.duplicateIndexes.length > 0) {
    return {
      status: "error",
      message: "Choose Import as a separate copy for an existing recipe."
    };
  }
  const selectedIndexes = reviewedSelection.selectedIndexes;
  if (selectedIndexes.length === 0) {
    return { status: "error", message: "Choose at least one recipe to save." };
  }

  const normalized = selectedIndexes.map((index) => ({
    index,
    result: normalizeRecipeInput(readRecipeInput(formData, `recipe_${index}_`))
  }));
  if (normalized.some(({ result }) => !result.ok)) {
    return {
      status: "error",
      message: "Check the selected recipe details before saving."
    };
  }
  const validRecipes = normalized.flatMap(({ index, result }) =>
    result.ok ? [{ index, value: result.value }] : []
  );

  const context = await getHouseholdClient();
  if (!context) {
    return {
      status: "error",
      message: "Finish account setup before saving imported recipes."
    };
  }

  const existingMatches = new Map<
    string,
    ReturnType<typeof findRecipeImportMatches>
  >();
  const sourceRows = await context.supabase
    .from("recipes")
    .select("id, title, source_url")
    .not("source_url", "is", null);
  if (sourceRows.error || !sourceRows.data) {
    return {
      status: "error",
      message:
        "The selected recipes could not be checked for duplicates. Refresh and try again."
    };
  }
  for (const entry of validRecipes) {
    existingMatches.set(
      String(entry.index),
      entry.value.sourceUrl
        ? findRecipeImportMatches(
            entry.value.sourceUrl,
            sourceRows.data.map((recipe) => ({
              id: recipe.id,
              title: recipe.title,
              sourceUrl: recipe.source_url
            }))
          )
        : []
    );
  }
  for (const entry of validRecipes) {
    const matches = existingMatches.get(String(entry.index)) ?? [];
    const knownDuplicate =
      formData.get(`recipe_${entry.index}_knownDuplicate`) === "1";
    if (matches.length > 0 && !knownDuplicate) {
      return {
        status: "error",
        message:
          "One recipe was saved while this review was open. Refresh and review the import again."
      };
    }
  }

  const insertedIds: string[] = [];
  for (const entry of validRecipes) {
    const { data, error } = await context.supabase
      .from("recipes")
      .insert(buildRecipeRecord(entry.value, context.householdId))
      .select("id")
      .single();
    if (error || !data?.id) {
      if (insertedIds.length > 0) {
        await context.supabase.from("recipes").delete().in("id", insertedIds);
      }
      return {
        status: "error",
        message:
          "The selected recipes could not be saved. Refresh and try again."
      };
    }
    insertedIds.push(data.id);

    const image = readConfirmedImage(formData, `recipe_${entry.index}_`);
    if (image && "error" in image) {
      await context.supabase.from("recipes").delete().in("id", insertedIds);
      return { status: "error", message: image.error };
    }
    if (image && !("error" in image)) {
      const imageSaved = await saveConfirmedImage(
        context.supabase,
        context.householdId,
        data.id,
        image,
        entry.value.sourceUrl
      );
      if (!imageSaved) {
        await context.supabase.from("recipes").delete().in("id", insertedIds);
        return {
          status: "error",
          message:
            "A selected image could not be saved. Try again or leave it unchecked."
        };
      }
    }
  }

  revalidatePath("/recipes");
  revalidatePath("/week");
  revalidatePath("/today");
  revalidatePath("/kitchen");
  redirect(`/recipes?imported=${selectedIndexes.length}`);
}

export async function updateRecipe(
  recipeId: string,
  _previousState: RecipeFormState,
  formData: FormData
): Promise<RecipeFormState> {
  const normalized = normalizeRecipeInput(readRecipeInput(formData));
  if (!normalized.ok) {
    return {
      status: "error",
      message: "Check the highlighted recipe fields.",
      fieldErrors: normalized.errors
    };
  }

  const context = await getHouseholdClient();
  if (!context) {
    return databaseErrorState("Finish account setup before editing recipes.");
  }

  const { error } = await context.supabase
    .from("recipes")
    .update({
      title: normalized.value.title,
      description: normalized.value.description,
      ingredients: normalized.value.ingredients,
      instructions: normalized.value.instructions,
      prep_minutes: normalized.value.prepMinutes,
      cook_minutes: normalized.value.cookMinutes,
      servings: normalized.value.servings,
      notes: normalized.value.notes,
      source_url: normalized.value.sourceUrl,
      source_title: normalized.value.sourceTitle,
      source_type: normalized.value.sourceUrl ? "imported" : "manual",
      tags: normalized.value.tags,
      is_favorite: normalized.value.favorite
    })
    .eq("id", recipeId);

  if (error) {
    return databaseErrorState(
      "The recipe could not be updated. Refresh and try again."
    );
  }

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/week");
  revalidatePath("/today");
  redirect(`/recipes/${recipeId}?updated=1`);
}

export async function toggleRecipeFavorite(recipeId: string): Promise<void> {
  const context = await getHouseholdClient();
  if (!context) return;

  const current = await context.supabase
    .from("recipes")
    .select("is_favorite")
    .eq("id", recipeId)
    .maybeSingle();
  if (current.error || !current.data) return;

  await context.supabase
    .from("recipes")
    .update({ is_favorite: !current.data.is_favorite })
    .eq("id", recipeId);
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
}

export async function deleteRecipe(recipeId: string): Promise<void> {
  const context = await getHouseholdClient();
  if (!context) return;

  await context.supabase.from("recipes").delete().eq("id", recipeId);
  revalidatePath("/recipes");
  revalidatePath("/week");
  revalidatePath("/today");
  revalidatePath("/kitchen");
  redirect("/recipes?deleted=1");
}
