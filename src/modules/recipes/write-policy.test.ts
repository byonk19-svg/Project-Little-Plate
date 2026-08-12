import { describe, expect, test } from "vitest";

import { buildRecipeRecord } from "@/modules/recipes/write-policy";

describe("recipe write policy", () => {
  test("builds one persisted recipe record for manual and imported writes", () => {
    expect(
      buildRecipeRecord(
        {
          title: " Apple Oats ",
          description: null,
          ingredients: "1 apple",
          instructions: "Cook",
          prepMinutes: 5,
          cookMinutes: null,
          servings: 2,
          notes: null,
          sourceUrl: "https://example.com/apple",
          sourceTitle: "Example",
          tags: ["breakfast"],
          favorite: true
        },
        "household-1"
      )
    ).toEqual({
      household_id: "household-1",
      title: " Apple Oats ",
      description: null,
      ingredients: "1 apple",
      instructions: "Cook",
      prep_minutes: 5,
      cook_minutes: null,
      servings: 2,
      notes: null,
      source_url: "https://example.com/apple",
      source_title: "Example",
      source_type: "imported",
      import_status: "confirmed",
      tags: ["breakfast"],
      is_favorite: true
    });
  });
});
