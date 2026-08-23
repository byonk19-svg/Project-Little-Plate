const errorMessages: Record<string, string> = {
  delete: "The recipe could not be deleted. Refresh and try again.",
  favorite: "Favorite status could not be updated. Refresh and try again.",
  setup: "Finish account setup before changing this recipe."
};

export function recipeFavoriteMessage(
  value: string | undefined
): string | null {
  if (value === "added") return "Recipe added to favorites.";
  if (value === "removed") return "Recipe removed from favorites.";
  return null;
}

export function recipeActionErrorMessage(
  code: string | undefined
): string | null {
  if (!code) return null;
  return (
    errorMessages[code] ??
    "The recipe action could not be completed. Refresh and try again."
  );
}
