export type RecipeMealSlot = "breakfast" | "lunch" | "dinner";
export type RecipeSlotStatus = "planned" | "skipped" | "completed";

export type RecipeSlotSummary = {
  localDate: string;
  mealSlot: RecipeMealSlot;
  status: RecipeSlotStatus;
};

const mealSlotOrder: Record<RecipeMealSlot, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2
};

export function getWeekDates(windowStart: string): string[] {
  const start = new Date(`${windowStart}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

export function selectNextPlannedSlot<T extends RecipeSlotSummary>(
  slots: T[],
  today: string
): T | null {
  return (
    [...slots]
      .filter((slot) => slot.status === "planned" && slot.localDate >= today)
      .sort(
        (left, right) =>
          left.localDate.localeCompare(right.localDate) ||
          mealSlotOrder[left.mealSlot] - mealSlotOrder[right.mealSlot]
      )[0] ?? null
  );
}

export function getCurrentIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
