import { describe, expect, test } from "vitest";

import { parseDerivedWork } from "@/modules/derived/queries";

const ready = {
  status: "ready",
  baby_id: "baby-1",
  time_zone: "America/Chicago",
  window_start: "2026-07-28",
  plan_version: 3,
  preparation_tasks: [
    {
      preparation_id: "prep-1",
      preparation_name: "Preparation one",
      needed_portions: 2,
      task_fingerprint: "0123456789abcdef0123456789abcdef",
      seed_component_id: "component-1",
      supporting_meals: [
        {
          component_id: "component-1",
          meal_id: "meal-1",
          local_date: "2026-07-29",
          meal_slot: "breakfast"
        }
      ]
    }
  ],
  derived_grocery_items: [
    {
      food_id: "food-1",
      food_name: "Food one",
      store_section: "Produce",
      needed_portions: 2,
      already_have: false,
      is_checked: true
    }
  ],
  manual_grocery_items: [
    {
      id: "item-1",
      name: "Manual item",
      store_section: "Other",
      quantity: 1,
      is_checked: false
    }
  ]
};

describe("derived work transport", () => {
  test("accepts a complete derived plan", () => {
    expect(parseDerivedWork(ready)).toEqual(
      expect.objectContaining({
        babyId: "baby-1",
        planVersion: 3,
        preparationTasks: [
          expect.objectContaining({
            preparationId: "prep-1",
            neededPortions: 2
          })
        ],
        derivedGroceryItems: [
          expect.objectContaining({ foodId: "food-1", checked: true })
        ],
        manualGroceryItems: [
          expect.objectContaining({ id: "item-1", quantity: 1 })
        ]
      })
    );
  });

  test.each([
    ["unsupported status", { ...ready, status: "unavailable" }],
    [
      "invalid quantity",
      {
        ...ready,
        derived_grocery_items: [
          { ...ready.derived_grocery_items[0], needed_portions: 0 }
        ]
      }
    ],
    [
      "missing meal trace",
      {
        ...ready,
        preparation_tasks: [
          { ...ready.preparation_tasks[0], supporting_meals: [] }
        ]
      }
    ]
  ])("fails closed for %s", (_label, value) => {
    expect(parseDerivedWork(value)).toBeNull();
  });
});
