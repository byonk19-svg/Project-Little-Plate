import { describe, expect, test } from "vitest";

import { buildPlannerGenerationAttempt } from "@/modules/planner/generation";

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    status: "ready",
    reference_at: "2026-11-01T12:00:00.000Z",
    time_zone: "America/Chicago",
    input_token: "snapshot-token",
    expected_version: 0,
    meal_requests: [
      {
        meal_id: "2026-11-02:breakfast",
        local_date: "2026-11-02",
        meal_slot: "breakfast",
        consume_by: "2026-11-03T06:00:00.000Z",
        component_count: 1,
        is_locked: false,
        locked_components: []
      }
    ],
    feeding: {
      status: "ready",
      skills: [
        { id: "skill-reviewed", label: "Synthetic skill", status: "observed" }
      ],
      foods: [
        {
          id: "food-reviewed",
          name: "Synthetic food",
          restriction_status: "no_known_restriction",
          exposure_state: "liked",
          exposure_selectable: true,
          is_quick_backup: false
        }
      ],
      preferences: {
        new_food_pace: "one_per_week",
        preparation_time: "under_30_minutes",
        prep_day: null
      }
    },
    candidates: [
      {
        preparation_id: "prep-reviewed",
        revision_id: "revision-reviewed",
        food_id: "food-reviewed",
        preparation_slug: "prep-reviewed",
        required_skill_tag_ids: ["skill-reviewed"],
        refrigerator_profiles: [
          {
            profile_id: "profile-reviewed",
            duration_min_hours: 48,
            reviewed_at: "2026-10-01",
            source_id: "source-reviewed"
          }
        ]
      }
    ],
    inventory: [],
    ...overrides
  };
}

describe("planner generation adapter", () => {
  test("turns one reviewed snapshot into a complete explained engine output", () => {
    const result = buildPlannerGenerationAttempt(snapshot());

    expect(result.status).toBe("feasible");
    if (result.status === "feasible") {
      expect(result).toEqual(
        expect.objectContaining({
          expectedVersion: 0,
          inputToken: "snapshot-token",
          referenceAt: "2026-11-01T12:00:00.000Z"
        })
      );
      expect(result.output.plan.meals).toEqual([
        expect.objectContaining({
          mealId: "2026-11-02:breakfast",
          components: [
            expect.objectContaining({
              preparationId: "prep-reviewed",
              strategyId: "profile-reviewed",
              source: "new_preparation"
            })
          ]
        })
      ]);
      expect(result.output.explanations).toEqual({
        meals: [
          {
            mealId: "2026-11-02:breakfast",
            components: [
              {
                position: 0,
                preparationId: "prep-reviewed",
                messages: [
                  "Adds preparation work because no valid portion is available.",
                  "Adds variety without changing safety requirements."
                ]
              }
            ]
          }
        ]
      });
    }
  });

  test("returns an actionable failure without output when reviewed storage is absent", () => {
    const unavailable = snapshot({
      candidates: [
        {
          preparation_id: "prep-reviewed",
          revision_id: "revision-reviewed",
          food_id: "food-reviewed",
          preparation_slug: "prep-reviewed",
          required_skill_tag_ids: ["skill-reviewed"],
          refrigerator_profiles: []
        }
      ]
    });

    expect(buildPlannerGenerationAttempt(unavailable)).toEqual({
      status: "infeasible",
      reason: "storage_infeasible"
    });
  });

  test("fails closed instead of coercing malformed database snapshots", () => {
    expect(
      buildPlannerGenerationAttempt(
        snapshot({ expected_version: "not-a-version" })
      )
    ).toEqual({
      status: "infeasible",
      reason: "snapshot_unavailable"
    });
  });

  test("preserves exact locked component identities in generated output", () => {
    const locked = snapshot({
      expected_version: 4,
      meal_requests: [
        {
          meal_id: "2026-11-02:breakfast",
          local_date: "2026-11-02",
          meal_slot: "breakfast",
          consume_by: "2026-11-03T06:00:00.000Z",
          component_count: 1,
          is_locked: true,
          locked_components: [
            {
              position: 0,
              preparation_id: "prep-reviewed",
              revision_id: "revision-reviewed"
            }
          ]
        }
      ]
    });
    const result = buildPlannerGenerationAttempt(locked);

    expect(result.status).toBe("feasible");
    if (result.status === "feasible") {
      expect(result.output.plan.meals[0].components[0]).toEqual(
        expect.objectContaining({
          preparationId: "prep-reviewed",
          revisionId: "revision-reviewed",
          reasonCodes: expect.arrayContaining(["locked_by_caregiver"])
        })
      );
    }
  });
});
