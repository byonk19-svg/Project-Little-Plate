"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getHouseholdContext } from "@/modules/household/server";
import { findRecipeImportMatches } from "@/modules/recipe-import/duplicates";
import type { RecipeImportFormState } from "@/modules/recipe-import/form-state";
import { fetchRecipePage } from "@/modules/recipe-import/parser";
import { buildImportPreview } from "@/modules/recipe-import/workflow";

async function existingRecipeMatches(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  sourceUrl: string
) {
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

export async function importRecipeFromUrl(
  _previousState: RecipeImportFormState,
  formData: FormData
): Promise<RecipeImportFormState> {
  const context = await getHouseholdContext();
  if (context.status === "signed_out") redirect("/login");
  if (context.status !== "authenticated") {
    return {
      status: "error",
      message: "Finish account setup before importing."
    };
  }
  const { supabase } = context;

  const url = String(formData.get("url") ?? "").trim();
  if (!url) {
    return {
      status: "error",
      message: "Paste a recipe website link to import."
    };
  }

  try {
    const result = await fetchRecipePage(url);
    if (!result.ok) {
      return {
        status: "error",
        message:
          "We could not find complete recipe details on that page. You can add the recipe manually instead."
      };
    }
    if ("drafts" in result) {
      const drafts = await Promise.all(
        result.drafts.map(async (draft) => ({
          ...buildImportPreview(draft),
          existingMatches: await existingRecipeMatches(
            supabase,
            draft.sourceUrl
          )
        }))
      );
      return {
        status: "success",
        message: `We found ${drafts.length} recipes. Choose which ones to save.`,
        drafts
      };
    }
    const existingMatches = await existingRecipeMatches(
      supabase,
      result.draft.sourceUrl
    );
    return {
      status: "success",
      message: "Review the imported details before saving.",
      draft: { ...buildImportPreview(result.draft), existingMatches }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed.";
    return {
      status: "error",
      message: `${message} You can add the recipe manually instead.`
    };
  }
}
