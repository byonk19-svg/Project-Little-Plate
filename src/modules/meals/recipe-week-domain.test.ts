import { describe, expect, it } from "vitest";

import {
  getWeekDates,
  selectNextPlannedSlot
} from "@/modules/meals/recipe-week-domain";

describe("recipe week domain", () => {
  it("creates seven consecutive local dates", () => {
    expect(getWeekDates("2026-08-30")).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05"
    ]);
  });

  it("selects the first planned slot on or after today", () => {
    const slots = [
      {
        localDate: "2026-08-12",
        mealSlot: "dinner" as const,
        status: "completed" as const
      },
      {
        localDate: "2026-08-13",
        mealSlot: "breakfast" as const,
        status: "skipped" as const
      },
      {
        localDate: "2026-08-13",
        mealSlot: "lunch" as const,
        status: "planned" as const
      },
      {
        localDate: "2026-08-14",
        mealSlot: "breakfast" as const,
        status: "planned" as const
      }
    ];

    expect(selectNextPlannedSlot(slots, "2026-08-13")).toEqual(slots[2]);
  });
});
