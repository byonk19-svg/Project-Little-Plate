import { normalizeRecipeSourceUrl } from "@/modules/recipes/domain";

export type RecipeImportMatch = {
  id: string;
  title: string;
};

type SourceRecipe = {
  id: string;
  title: string;
  sourceUrl: string | null;
};

export function findRecipeImportMatches(
  sourceUrl: string,
  recipes: readonly SourceRecipe[]
): RecipeImportMatch[] {
  let normalizedSourceUrl: string;
  try {
    normalizedSourceUrl = normalizeRecipeSourceUrl(sourceUrl);
  } catch {
    return [];
  }

  return recipes
    .filter((recipe) => {
      if (!recipe.sourceUrl) return false;
      try {
        return (
          normalizeRecipeSourceUrl(recipe.sourceUrl) === normalizedSourceUrl
        );
      } catch {
        return false;
      }
    })
    .map(({ id, title }) => ({ id, title }));
}
