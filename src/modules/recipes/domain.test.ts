import { describe, expect, it } from "vitest";

import {
  normalizeRecipeInput,
  normalizeRecipeSourceUrl,
  parseRecipeTags,
  recipeMatchesSearch,
  type RecipeInput
} from "@/modules/recipes/domain";

const validInput: RecipeInput = {
  title: "  Tomato Pasta  ",
  description: "A weeknight favorite.",
  ingredients: "Tomatoes\nPasta",
  instructions: "Boil pasta. Stir together.",
  prepMinutes: "10",
  cookMinutes: "20",
  servings: "4",
  notes: "Add basil.",
  sourceUrl: "https://example.com/tomato-pasta",
  sourceTitle: "Example Kitchen",
  tags: "quick, family, quick",
  favorite: true
};

describe("recipe domain", () => {
  it("normalizes a complete recipe into editable personal content", () => {
    expect(normalizeRecipeInput(validInput)).toEqual({
      ok: true,
      value: {
        title: "Tomato Pasta",
        description: "A weeknight favorite.",
        ingredients: "Tomatoes\nPasta",
        instructions: "Boil pasta. Stir together.",
        prepMinutes: 10,
        cookMinutes: 20,
        servings: 4,
        notes: "Add basil.",
        sourceUrl: "https://example.com/tomato-pasta",
        sourceTitle: "Example Kitchen",
        tags: ["quick", "family"],
        favorite: true
      }
    });
  });

  it("rejects missing title and instructions with field errors", () => {
    const result = normalizeRecipeInput({
      ...validInput,
      title: " ",
      instructions: ""
    });

    expect(result).toEqual({
      ok: false,
      errors: {
        title: "Add a recipe title.",
        instructions: "Add the recipe instructions."
      }
    });
  });

  it("rejects malformed URLs and negative numeric values", () => {
    const result = normalizeRecipeInput({
      ...validInput,
      sourceUrl: "not-a-url",
      prepMinutes: "-1",
      servings: "0"
    });

    expect(result).toEqual({
      ok: false,
      errors: {
        sourceUrl: "Use a valid http:// or https:// recipe link.",
        prepMinutes: "Use a whole number of minutes.",
        servings: "Use a whole number greater than zero."
      }
    });
  });

  it("parses tags deterministically and removes duplicates", () => {
    expect(parseRecipeTags('  Quick, family, quick, "week night" ')).toEqual([
      "quick",
      "family",
      "week night"
    ]);
  });

  it("matches title, ingredients, and tags without case sensitivity", () => {
    const recipe = {
      title: "Tomato Pasta",
      ingredients: "Tomatoes\nPasta",
      tags: ["quick", "family"]
    };

    expect(recipeMatchesSearch(recipe, "tomato")).toBe(true);
    expect(recipeMatchesSearch(recipe, "PASTA")).toBe(true);
    expect(recipeMatchesSearch(recipe, "family")).toBe(true);
    expect(recipeMatchesSearch(recipe, "dessert")).toBe(false);
  });

  it("normalizes source URLs for duplicate import matching", () => {
    expect(
      normalizeRecipeSourceUrl(
        "HTTPS://Example.com/tomato-pasta/?utm_source=newsletter&servings=4#recipe"
      )
    ).toBe("https://example.com/tomato-pasta?servings=4");
  });

  it("keeps distinct recipe paths distinct when normalizing source URLs", () => {
    expect(
      normalizeRecipeSourceUrl("https://example.com/tomato-pasta")
    ).not.toBe(normalizeRecipeSourceUrl("https://example.com/garlic-pasta"));
  });

  it("treats http and https versions of a source as the same recipe URL", () => {
    expect(normalizeRecipeSourceUrl("http://example.com/pasta")).toBe(
      normalizeRecipeSourceUrl("https://example.com/pasta")
    );
  });
});
