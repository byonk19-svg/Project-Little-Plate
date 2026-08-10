import { describe, expect, test } from "vitest";

import {
  normalizePersonalRecipeDraft,
  validatePublicRecipeUrl,
  type PersonalRecipeDraft
} from "@/modules/recipes/domain";

const validDraft: PersonalRecipeDraft = {
  title: "  Banana oats  ",
  ingredients: "Banana\r\nOats",
  instructions: "Mix and serve.",
  notes: "Soft texture",
  sourceUrl: "https://example.com/recipe",
  sourceType: "recipe_url",
  extractionMethod: "json_ld"
};

describe("personal recipe domain", () => {
  test("normalizes a caregiver-confirmed recipe without adding safety fields", () => {
    expect(normalizePersonalRecipeDraft(validDraft)).toEqual({
      status: "valid",
      recipe: {
        title: "Banana oats",
        ingredients: "Banana\nOats",
        instructions: "Mix and serve.",
        notes: "Soft texture",
        sourceUrl: "https://example.com/recipe",
        sourceType: "recipe_url",
        extractionMethod: "json_ld"
      }
    });
  });

  test.each([
    ["http://example.com/recipe", "https_only"],
    ["https://", "invalid_url"],
    ["https://localhost/recipe", "private_host"],
    ["https://127.0.0.1/recipe", "private_host"],
    ["https://example.com:8443/recipe", "port_not_allowed"]
  ])("rejects unsafe source URL %s", (url, reason) => {
    expect(validatePublicRecipeUrl(url)).toEqual({
      valid: false,
      reason
    });
  });

  test("allows a public HTTPS source URL", () => {
    expect(validatePublicRecipeUrl("https://recipes.example/banana")).toEqual({
      valid: true,
      url: "https://recipes.example/banana"
    });
  });

  test("rejects blank title and instructions while allowing optional notes", () => {
    expect(
      normalizePersonalRecipeDraft({
        ...validDraft,
        title: " ",
        instructions: ""
      })
    ).toEqual({
      status: "invalid",
      errors: {
        title: "Enter a recipe title.",
        instructions: "Enter recipe instructions or preparation notes."
      }
    });
  });
});
