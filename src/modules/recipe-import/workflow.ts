import type { RecipeImportDraft } from "@/modules/recipe-import/parser";

export function buildImportPreview(
  draft: RecipeImportDraft
): RecipeImportDraft {
  return {
    title: draft.title,
    description: draft.description,
    ingredients: draft.ingredients,
    instructions: draft.instructions,
    prepMinutes: draft.prepMinutes,
    cookMinutes: draft.cookMinutes,
    servings: draft.servings,
    sourceUrl: draft.sourceUrl,
    sourceTitle: draft.sourceTitle,
    tags: draft.tags,
    suggestedImageUrl: draft.suggestedImageUrl,
    existingMatches: draft.existingMatches ?? []
  };
}

export function selectReviewedImportDrafts(
  entries: Array<{
    index: number;
    knownDuplicate: boolean;
    allowDuplicate: boolean;
  }>
): { selectedIndexes: number[]; duplicateIndexes: number[] } {
  const selectedIndexes: number[] = [];
  const duplicateIndexes: number[] = [];
  for (const entry of entries) {
    if (entry.knownDuplicate && !entry.allowDuplicate) {
      duplicateIndexes.push(entry.index);
    } else {
      selectedIndexes.push(entry.index);
    }
  }
  return { selectedIndexes, duplicateIndexes };
}
