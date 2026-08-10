"use server";

import type { RecipeImportState } from "@/modules/recipes/form-state";
import { fetchRecipePreview } from "@/modules/recipes/import-actions";

export async function importRecipeFromUrl(
  _previousState: RecipeImportState,
  formData: FormData
): Promise<RecipeImportState> {
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim();
  if (!sourceUrl) {
    return { status: "error", message: "Paste a public HTTPS recipe link." };
  }
  const result = await fetchRecipePreview(sourceUrl);
  if (result.status === "error") {
    return { status: "error", message: result.message };
  }
  return {
    status: result.status,
    message:
      result.status === "ready"
        ? "Recipe details extracted. Review them before saving."
        : "Some recipe fields are missing. Complete them before saving.",
    sourceUrl: result.preview.sourceUrl,
    title: result.preview.title,
    ingredients: result.preview.ingredients,
    instructions: result.preview.instructions,
    notes: result.preview.notes,
    extractionMethod: result.preview.extractionMethod,
    missing: result.preview.missing
  };
}
