import { describe, expect, it } from "vitest";

import { findRecipeImportMatches } from "@/modules/recipe-import/duplicates";

describe("recipe import duplicates", () => {
  it("finds all household recipes with the same normalized source URL", () => {
    expect(
      findRecipeImportMatches("https://example.com/pasta/?utm_campaign=mail", [
        {
          id: "one",
          title: "Pasta",
          sourceUrl: "https://example.com/pasta"
        },
        {
          id: "two",
          title: "Pasta, edited",
          sourceUrl: "https://example.com/pasta?fbclid=tracking"
        },
        {
          id: "three",
          title: "Soup",
          sourceUrl: "https://example.com/soup"
        }
      ])
    ).toEqual([
      { id: "one", title: "Pasta" },
      { id: "two", title: "Pasta, edited" }
    ]);
  });

  it("does not match manual recipes or different source paths", () => {
    expect(
      findRecipeImportMatches("https://example.com/pasta", [
        { id: "one", title: "Manual pasta", sourceUrl: null },
        { id: "two", title: "Soup", sourceUrl: "https://example.com/soup" }
      ])
    ).toEqual([]);
  });
});
