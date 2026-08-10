import { describe, expect, test } from "vitest";

import { parsePersonalPlanningItem } from "@/modules/recipes/queries";

describe("personal planning item transport", () => {
  test("accepts a complete not-reviewed item", () => {
    expect(
      parsePersonalPlanningItem({
        id: "item-1",
        recipe_id: "recipe-1",
        baby_id: "baby-1",
        local_date: "2026-08-10",
        meal_slot: "dinner",
        title: "Banana oats",
        ingredients: "Banana",
        instructions: "Mix",
        source_url: null,
        label: "Personal recipe — not reviewed"
      })
    ).toEqual({
      id: "item-1",
      recipeId: "recipe-1",
      babyId: "baby-1",
      localDate: "2026-08-10",
      mealSlot: "dinner",
      title: "Banana oats",
      ingredients: "Banana",
      instructions: "Mix",
      sourceUrl: null,
      label: "Personal recipe — not reviewed"
    });
  });

  test("rejects a row that could masquerade as reviewed content", () => {
    expect(
      parsePersonalPlanningItem({
        id: "item-1",
        recipe_id: "recipe-1",
        baby_id: "baby-1",
        local_date: "2026-08-10",
        meal_slot: "dinner",
        title: "Banana oats",
        ingredients: "Banana",
        instructions: "Mix",
        source_url: null,
        label: "Eligible preparation"
      })
    ).toBeNull();
  });
});
