import { describe, expect, test } from "vitest";

import { deriveWorkAndGroceries } from "@/modules/derived/domain";

const components = [
  {
    componentId: "component-2",
    mealId: "meal-2",
    localDate: "2026-07-30",
    mealSlot: "lunch",
    position: 1,
    preparationId: "prep-a",
    revisionId: "revision-current",
    scheduledBoundaryAt: "2026-07-31T05:00:00.000Z",
    preparationName: "Preparation A",
    foodId: "food-a",
    foodName: "Food A",
    storeSection: "Produce"
  },
  {
    componentId: "component-1",
    mealId: "meal-1",
    localDate: "2026-07-29",
    mealSlot: "breakfast",
    position: 1,
    preparationId: "prep-a",
    revisionId: "revision-current",
    scheduledBoundaryAt: "2026-07-30T05:00:00.000Z",
    preparationName: "Preparation A",
    foodId: "food-a",
    foodName: "Food A",
    storeSection: "Produce"
  },
  {
    componentId: "component-3",
    mealId: "meal-3",
    localDate: "2026-07-31",
    mealSlot: "dinner",
    position: 1,
    preparationId: "prep-b",
    revisionId: "revision-current",
    scheduledBoundaryAt: "2026-08-01T05:00:00.000Z",
    preparationName: "Preparation B",
    foodId: "food-a",
    foodName: "Food A",
    storeSection: "Produce"
  }
] as const;

describe("derived preparation and grocery work", () => {
  test("allocates valid portions to the earliest meals and merges duplicate food needs", () => {
    expect(
      deriveWorkAndGroceries({
        components: [...components].reverse(),
        inventoryPortions: [
          {
            preparationId: "prep-a",
            revisionId: "revision-current",
            validUntil: "2026-08-01T05:00:00.000Z"
          }
        ],
        quickBackupFoodIds: new Set(),
        groceryStateByFood: {}
      })
    ).toEqual({
      preparationTasks: [
        {
          preparationId: "prep-a",
          preparationName: "Preparation A",
          neededPortions: 1,
          supportingMeals: [
            {
              componentId: "component-2",
              mealId: "meal-2",
              localDate: "2026-07-30",
              mealSlot: "lunch"
            }
          ]
        },
        {
          preparationId: "prep-b",
          preparationName: "Preparation B",
          neededPortions: 1,
          supportingMeals: [
            {
              componentId: "component-3",
              mealId: "meal-3",
              localDate: "2026-07-31",
              mealSlot: "dinner"
            }
          ]
        }
      ],
      groceryItems: [
        {
          foodId: "food-a",
          foodName: "Food A",
          storeSection: "Produce",
          neededPortions: 2,
          alreadyHave: false,
          checked: false
        }
      ]
    });
  });

  test("keeps already-have and checked state separate while available quick backups remove grocery need", () => {
    const result = deriveWorkAndGroceries({
      components: [
        ...components,
        {
          componentId: "component-4",
          mealId: "meal-4",
          localDate: "2026-08-01",
          mealSlot: "breakfast",
          position: 1,
          preparationId: "prep-c",
          revisionId: "revision-current",
          scheduledBoundaryAt: "2026-08-01T05:00:00.000Z",
          preparationName: "Preparation C",
          foodId: "food-backup",
          foodName: "Backup food",
          storeSection: "Shelf stable"
        }
      ],
      inventoryPortions: [
        {
          preparationId: "prep-a",
          revisionId: "revision-current",
          validUntil: "2026-08-02T05:00:00.000Z"
        },
        {
          preparationId: "prep-a",
          revisionId: "revision-current",
          validUntil: "2026-08-02T05:00:00.000Z"
        }
      ],
      quickBackupFoodIds: new Set(["food-backup"]),
      groceryStateByFood: {
        "food-a": { alreadyHave: true, checked: true }
      }
    });

    expect(result.preparationTasks).toHaveLength(2);
    expect(result.groceryItems).toEqual([
      {
        foodId: "food-a",
        foodName: "Food A",
        storeSection: "Produce",
        neededPortions: 1,
        alreadyHave: true,
        checked: true
      }
    ]);
  });

  test("is independent of input row order", () => {
    const input = {
      inventoryPortions: [],
      quickBackupFoodIds: new Set<string>(),
      groceryStateByFood: {}
    };

    expect(
      deriveWorkAndGroceries({ ...input, components: [...components] })
    ).toEqual(
      deriveWorkAndGroceries({
        ...input,
        components: [...components].reverse()
      })
    );
  });

  test("does not allocate expired-at-meal or incompatible revision portions", () => {
    const result = deriveWorkAndGroceries({
      components: components.slice(0, 2),
      inventoryPortions: [
        {
          preparationId: "prep-a",
          revisionId: "revision-current",
          validUntil: "2026-07-30T06:00:00.000Z"
        },
        {
          preparationId: "prep-a",
          revisionId: "revision-retired",
          validUntil: "2026-08-02T05:00:00.000Z"
        }
      ],
      quickBackupFoodIds: new Set(),
      groceryStateByFood: {}
    });

    expect(result.preparationTasks).toEqual([
      expect.objectContaining({
        preparationId: "prep-a",
        neededPortions: 1,
        supportingMeals: [
          expect.objectContaining({ componentId: "component-2" })
        ]
      })
    ]);
  });

  test("consumes mixed-deadline portions earliest-first without false shortages", () => {
    const inventoryPortions = [
      {
        preparationId: "prep-a",
        revisionId: "revision-current",
        validUntil: "2026-07-30T06:00:00.000Z"
      },
      {
        preparationId: "prep-a",
        revisionId: "revision-current",
        validUntil: "2026-07-31T06:00:00.000Z"
      }
    ];
    const input = {
      components: components.slice(0, 2),
      quickBackupFoodIds: new Set<string>(),
      groceryStateByFood: {}
    };

    expect(
      deriveWorkAndGroceries({ ...input, inventoryPortions }).preparationTasks
    ).toEqual([]);
    expect(
      deriveWorkAndGroceries({
        ...input,
        inventoryPortions: inventoryPortions.slice(0, 1)
      }).preparationTasks
    ).toEqual([
      expect.objectContaining({
        neededPortions: 1,
        supportingMeals: [
          expect.objectContaining({ componentId: "component-2" })
        ]
      })
    ]);
  });
});
