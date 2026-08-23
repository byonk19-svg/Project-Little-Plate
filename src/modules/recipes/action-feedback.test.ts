import { describe, expect, it } from "vitest";

import {
  recipeActionErrorMessage,
  recipeFavoriteMessage
} from "./action-feedback";

describe("recipe action feedback", () => {
  it("describes favorite changes", () => {
    expect(recipeFavoriteMessage("added")).toBe("Recipe added to favorites.");
    expect(recipeFavoriteMessage("removed")).toBe(
      "Recipe removed from favorites."
    );
    expect(recipeFavoriteMessage("unexpected")).toBeNull();
  });

  it("describes action failures without exposing transport details", () => {
    expect(recipeActionErrorMessage("favorite")).toBe(
      "Favorite status could not be updated. Refresh and try again."
    );
    expect(recipeActionErrorMessage("delete")).toBe(
      "The recipe could not be deleted. Refresh and try again."
    );
    expect(recipeActionErrorMessage("setup")).toBe(
      "Finish account setup before changing this recipe."
    );
    expect(recipeActionErrorMessage("unexpected")).toBe(
      "The recipe action could not be completed. Refresh and try again."
    );
  });
});
