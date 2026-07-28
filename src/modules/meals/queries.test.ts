import { describe, expect, test } from "vitest";

import { parseWeekPlan } from "@/modules/meals/queries";

function validWeekPayload() {
  return {
    status: "ready",
    baby_id: "baby-1",
    plan_id: "plan-1",
    version: 1,
    time_zone: "America/Chicago",
    window_start: "2026-07-28",
    window_end: "2026-08-03",
    variety_summary: {
      planned_meals: 1,
      distinct_foods: 1,
      copy: "One reviewed food is planned."
    },
    days: Array.from({ length: 7 }, (_, index) => {
      const localDate = new Date("2026-07-28T00:00:00.000Z");
      localDate.setUTCDate(localDate.getUTCDate() + index);
      return {
        local_date: localDate.toISOString().slice(0, 10),
        slots: [
          {
            meal_id: "meal-1",
            meal_slot: "breakfast",
            status: "planned",
            is_locked: false,
            components: [
              {
                component_id: "component-1",
                position: 1,
                preparation_id: "preparation-1",
                revision_id: "revision-1",
                preparation_slug: "reviewed-preparation",
                preparation_name: "Reviewed preparation",
                food_name: "Reviewed food",
                availability_state: "eligible",
                unavailable_reason: null,
                is_locked: false,
                is_quick_backup: false,
                serving_status: "planned"
              }
            ]
          }
        ]
      };
    })
  };
}

describe("Week plan transport validation", () => {
  test("requires an explicit null unavailable reason for an eligible component", () => {
    const valid = validWeekPayload();
    expect(parseWeekPlan(valid)).not.toBeNull();

    const missing = structuredClone(valid);
    delete (
      missing.days[0].slots[0].components[0] as Partial<
        (typeof valid)["days"][number]["slots"][number]["components"][number]
      >
    ).unavailable_reason;
    expect(parseWeekPlan(missing)).toBeNull();

    const wrongType = structuredClone(valid);
    (
      wrongType.days[0].slots[0].components[0] as {
        unavailable_reason: unknown;
      }
    ).unavailable_reason = { reason: "not a transport string" };
    expect(parseWeekPlan(wrongType)).toBeNull();
  });
});
