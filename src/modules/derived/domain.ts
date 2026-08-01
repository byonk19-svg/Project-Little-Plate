export type DerivedComponentInput = {
  componentId: string;
  mealId: string;
  localDate: string;
  mealSlot: string;
  position: number;
  preparationId: string;
  revisionId: string;
  scheduledBoundaryAt: string;
  preparationName: string;
  foodId: string;
  foodName: string;
  storeSection: string;
};

type GroceryState = {
  alreadyHave: boolean;
  checked: boolean;
};

const mealSlotOrder: Record<string, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2
};

export function deriveWorkAndGroceries({
  components,
  inventoryPortions,
  quickBackupFoodIds,
  groceryStateByFood
}: {
  components: DerivedComponentInput[];
  inventoryPortions: Array<{
    preparationId: string;
    revisionId: string;
    validUntil: string;
  }>;
  quickBackupFoodIds: Set<string>;
  groceryStateByFood: Record<string, GroceryState>;
}) {
  const sorted = [...components].sort(
    (left, right) =>
      left.localDate.localeCompare(right.localDate) ||
      (mealSlotOrder[left.mealSlot] ?? 99) -
        (mealSlotOrder[right.mealSlot] ?? 99) ||
      left.position - right.position ||
      left.componentId.localeCompare(right.componentId)
  );
  const available = [...inventoryPortions].sort((left, right) =>
    left.validUntil.localeCompare(right.validUntil)
  );
  const unmet = sorted.filter((component) => {
    const unitIndex = available.findIndex(
      (unit) =>
        unit.preparationId === component.preparationId &&
        unit.revisionId === component.revisionId &&
        unit.validUntil > component.scheduledBoundaryAt
    );
    if (unitIndex >= 0) {
      available.splice(unitIndex, 1);
      return false;
    }
    return true;
  });
  const tasks = new Map<
    string,
    {
      preparationId: string;
      preparationName: string;
      neededPortions: number;
      supportingMeals: Array<{
        componentId: string;
        mealId: string;
        localDate: string;
        mealSlot: string;
      }>;
    }
  >();
  const groceries = new Map<
    string,
    {
      foodId: string;
      foodName: string;
      storeSection: string;
      neededPortions: number;
      alreadyHave: boolean;
      checked: boolean;
    }
  >();

  for (const component of unmet) {
    const task = tasks.get(component.preparationId) ?? {
      preparationId: component.preparationId,
      preparationName: component.preparationName,
      neededPortions: 0,
      supportingMeals: []
    };
    task.neededPortions += 1;
    task.supportingMeals.push({
      componentId: component.componentId,
      mealId: component.mealId,
      localDate: component.localDate,
      mealSlot: component.mealSlot
    });
    tasks.set(component.preparationId, task);

    if (quickBackupFoodIds.has(component.foodId)) {
      continue;
    }
    const state = groceryStateByFood[component.foodId] ?? {
      alreadyHave: false,
      checked: false
    };
    const item = groceries.get(component.foodId) ?? {
      foodId: component.foodId,
      foodName: component.foodName,
      storeSection: component.storeSection,
      neededPortions: 0,
      ...state
    };
    item.neededPortions += 1;
    groceries.set(component.foodId, item);
  }

  return {
    preparationTasks: [...tasks.values()].sort((left, right) =>
      left.preparationName.localeCompare(right.preparationName)
    ),
    groceryItems: [...groceries.values()].sort(
      (left, right) =>
        left.storeSection.localeCompare(right.storeSection) ||
        left.foodName.localeCompare(right.foodName)
    )
  };
}
