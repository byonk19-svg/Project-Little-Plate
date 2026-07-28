import { describe, expect, test } from "vitest";

import {
  explainPlannerReasons,
  planDeterministicWeek,
  type PlannerInput,
  type PreparationCandidate
} from "@/modules/planner/engine";

const reviewedCandidate = (
  overrides: Partial<PreparationCandidate> = {}
): PreparationCandidate => ({
  preparationId: "prep-a",
  revisionId: "revision-a",
  foodId: "food-a",
  methodTagIds: ["method-a"],
  textureTagIds: ["texture-a"],
  published: true,
  requiredSkillTagIds: ["skill-a"],
  restrictionStatus: "allowed",
  reactionBlocked: false,
  exposureState: "familiar",
  preparationTime: "under_15_minutes",
  newPortionStrategies: [
    {
      strategyId: "strategy-a-refrigerator",
      storageLocation: "refrigerator",
      storageRuleRevisionId: "storage-a",
      supportedMealIds: ["meal-1", "meal-2", "meal-3", "meal-4"]
    }
  ],
  ...overrides
});

const baseInput = (overrides: Partial<PlannerInput> = {}): PlannerInput => {
  const preparations = overrides.preparations ?? [reviewedCandidate()];
  const restrictionSnapshot = overrides.restrictionSnapshot ?? [
    ...new Map(
      preparations.map((candidate) => [
        candidate.foodId,
        {
          foodId: candidate.foodId,
          status: candidate.restrictionStatus,
          version: 1
        }
      ])
    ).values()
  ];
  const exposureSnapshot = overrides.exposureSnapshot ?? [
    ...new Map(
      preparations.map((candidate) => [
        candidate.foodId,
        { foodId: candidate.foodId, state: candidate.exposureState }
      ])
    ).values()
  ];
  return {
    clock: "2026-11-01T12:00:00.000Z",
    timeZone: "America/Chicago",
    mealCount: 2,
    ruleRevisionIds: ["eligibility-r1", "storage-r1", "storage-a"],
    mealRequests: [
      {
        mealId: "meal-1",
        localDate: "2026-11-02",
        mealSlot: "breakfast",
        consumeBy: "2026-11-03T06:00:00.000Z",
        componentCount: 1,
        isLocked: false,
        lockedComponents: []
      },
      {
        mealId: "meal-2",
        localDate: "2026-11-03",
        mealSlot: "breakfast",
        consumeBy: "2026-11-04T06:00:00.000Z",
        componentCount: 1,
        isLocked: false,
        lockedComponents: []
      }
    ],
    inventory: [],
    skillSnapshot: [{ skillTagId: "skill-a", status: "observed" }],
    quickBackupFoodIds: [],
    preferences: {
      preparationTime: "under_30_minutes",
      newFoodPace: "one_per_week"
    },
    ...overrides,
    preparations,
    restrictionSnapshot,
    exposureSnapshot
  };
};

describe("deterministic weekly planner", () => {
  test("produces the same complete plan and hash independent of input row order", () => {
    const candidateB = reviewedCandidate({
      preparationId: "prep-b",
      revisionId: "revision-b",
      foodId: "food-b",
      methodTagIds: ["method-b"],
      textureTagIds: ["texture-b"],
      requiredSkillTagIds: ["skill-b"],
      newPortionStrategies: [
        {
          strategyId: "strategy-b-refrigerator",
          storageLocation: "refrigerator",
          storageRuleRevisionId: "storage-b",
          supportedMealIds: ["meal-1", "meal-2"]
        }
      ]
    });
    const input = baseInput({
      preparations: [reviewedCandidate(), candidateB],
      ruleRevisionIds: [
        "eligibility-r1",
        "storage-r1",
        "storage-a",
        "storage-b"
      ],
      restrictionSnapshot: [
        { foodId: "food-a", status: "allowed", version: 1 },
        { foodId: "food-b", status: "allowed", version: 1 }
      ],
      exposureSnapshot: [
        { foodId: "food-a", state: "familiar" },
        { foodId: "food-b", state: "familiar" }
      ],
      skillSnapshot: [
        { skillTagId: "skill-a", status: "observed" },
        { skillTagId: "skill-b", status: "observed" }
      ],
      quickBackupFoodIds: ["food-a", "food-b"]
    });
    const reversed = {
      ...input,
      mealRequests: [...input.mealRequests].reverse(),
      preparations: [...input.preparations].reverse(),
      ruleRevisionIds: [...input.ruleRevisionIds].reverse(),
      skillSnapshot: [...input.skillSnapshot].reverse(),
      restrictionSnapshot: [...input.restrictionSnapshot].reverse(),
      exposureSnapshot: [...input.exposureSnapshot].reverse(),
      quickBackupFoodIds: [...input.quickBackupFoodIds].reverse()
    };

    expect(planDeterministicWeek(reversed)).toEqual(
      planDeterministicWeek(input)
    );
  });

  test("hard constraints disqualify candidates before any soft priority", () => {
    const unsafeVariants: PreparationCandidate[] = [
      reviewedCandidate({
        preparationId: "restricted",
        foodId: "food-restricted",
        restrictionStatus: "blocked"
      }),
      reviewedCandidate({
        preparationId: "reaction",
        foodId: "food-reaction",
        reactionBlocked: true
      }),
      reviewedCandidate({
        preparationId: "skill",
        foodId: "food-skill",
        requiredSkillTagIds: ["skill-not-observed"]
      }),
      reviewedCandidate({
        preparationId: "unpublished",
        foodId: "food-unpublished",
        published: false
      })
    ];
    const safe = reviewedCandidate({
      preparationId: "safe",
      foodId: "food-safe"
    });
    const result = planDeterministicWeek(
      baseInput({
        preparations: [...unsafeVariants, safe],
        inventory: unsafeVariants.map((candidate, index) => ({
          batchId: `unsafe-batch-${index}`,
          deadlineRuleRevisionId: "storage-r1",
          preparationId: candidate.preparationId,
          revisionId: candidate.revisionId,
          location: "refrigerator",
          portions: 9,
          validUntil: "2026-12-01T00:00:00.000Z"
        }))
      })
    );

    expect(result.status).toBe("feasible");
    if (result.status === "feasible") {
      expect(
        result.plan.meals.flatMap((meal) =>
          meal.components.map((component) => component.preparationId)
        )
      ).toEqual(["safe", "safe"]);
    }
  });

  test("uses exact-revision expiring inventory first and emits reviewed thaw work", () => {
    const frozen = reviewedCandidate({
      preparationId: "prep-frozen",
      revisionId: "revision-frozen",
      foodId: "food-frozen",
      newPortionStrategies: []
    });
    const result = planDeterministicWeek(
      baseInput({
        preparations: [reviewedCandidate(), frozen],
        ruleRevisionIds: [
          "eligibility-r1",
          "storage-r1",
          "storage-a",
          "freeze-r1",
          "thaw-r1",
          "post-thaw-r1"
        ],
        restrictionSnapshot: [
          { foodId: "food-a", status: "allowed", version: 1 },
          { foodId: "food-frozen", status: "allowed", version: 1 }
        ],
        inventory: [
          {
            batchId: "wrong-revision",
            deadlineRuleRevisionId: "storage-r1",
            preparationId: "prep-a",
            revisionId: "retired-revision",
            location: "refrigerator",
            portions: 4,
            validUntil: "2026-12-01T00:00:00.000Z"
          },
          {
            batchId: "expiring",
            deadlineRuleRevisionId: "storage-r1",
            preparationId: "prep-a",
            revisionId: "revision-a",
            location: "refrigerator",
            portions: 1,
            validUntil: "2026-11-03T07:00:00.000Z"
          },
          {
            batchId: "frozen",
            deadlineRuleRevisionId: "storage-r1",
            preparationId: "prep-frozen",
            revisionId: "revision-frozen",
            location: "frozen",
            portions: 1,
            validUntil: "2026-11-10T00:00:00.000Z",
            freezeRuleRevisionId: "freeze-r1",
            thawRuleRevisionId: "thaw-r1",
            postThawRuleRevisionId: "post-thaw-r1"
          }
        ]
      })
    );

    expect(result.status).toBe("feasible");
    if (result.status === "feasible") {
      expect(result.plan.meals[0].components[0]).toEqual(
        expect.objectContaining({
          preparationId: "prep-a",
          source: "existing_refrigerated",
          batchId: "expiring"
        })
      );
      expect(result.plan.meals[1].components[0]).toEqual(
        expect.objectContaining({
          preparationId: "prep-frozen",
          source: "existing_frozen",
          batchId: "frozen"
        })
      );
      expect(result.plan.thawTasks).toEqual([
        expect.objectContaining({
          batchId: "frozen",
          thawRuleRevisionId: "thaw-r1",
          postThawRuleRevisionId: "post-thaw-r1"
        })
      ]);
    }
  });

  test("preserves eligible locks and returns no partial plan for infeasible locks", () => {
    const lockedInput = baseInput({
      mealCount: 1,
      mealRequests: [
        {
          ...baseInput().mealRequests[0],
          lockedComponents: [
            {
              position: 0,
              preparationId: "prep-a",
              revisionId: "revision-a"
            }
          ]
        }
      ]
    });
    const feasible = planDeterministicWeek(lockedInput);
    expect(feasible.status).toBe("feasible");
    if (feasible.status === "feasible") {
      expect(feasible.plan.meals[0].components[0].reasonCodes).toContain(
        "locked_by_caregiver"
      );
    }

    const failed = planDeterministicWeek({
      ...lockedInput,
      preparations: [reviewedCandidate({ restrictionStatus: "blocked" })],
      restrictionSnapshot: [{ foodId: "food-a", status: "blocked", version: 2 }]
    });
    expect(failed).toEqual(
      expect.objectContaining({
        status: "infeasible",
        reason: "locked_component_ineligible",
        mealId: "meal-1"
      })
    );
    expect(failed).not.toHaveProperty("plan");
  });

  test("reserves scarce inventory for later locked components", () => {
    const alternative = reviewedCandidate({
      preparationId: "prep-b",
      revisionId: "revision-b",
      foodId: "food-b",
      newPortionStrategies: [
        {
          strategyId: "strategy-b-refrigerator",
          storageLocation: "refrigerator",
          storageRuleRevisionId: "storage-b",
          supportedMealIds: ["meal-1", "meal-2"]
        }
      ]
    });
    const result = planDeterministicWeek(
      baseInput({
        preparations: [
          reviewedCandidate({ newPortionStrategies: [] }),
          alternative
        ],
        ruleRevisionIds: ["eligibility-r1", "storage-r1", "storage-b"],
        restrictionSnapshot: [
          { foodId: "food-a", status: "allowed", version: 1 },
          { foodId: "food-b", status: "allowed", version: 1 }
        ],
        inventory: [
          {
            batchId: "only-prep-a",
            deadlineRuleRevisionId: "storage-r1",
            preparationId: "prep-a",
            revisionId: "revision-a",
            location: "refrigerator",
            portions: 1,
            validUntil: "2026-11-05T00:00:00.000Z"
          }
        ],
        mealRequests: [
          baseInput().mealRequests[0],
          {
            ...baseInput().mealRequests[1],
            lockedComponents: [
              {
                position: 0,
                preparationId: "prep-a",
                revisionId: "revision-a"
              }
            ]
          }
        ]
      })
    );

    expect(result.status).toBe("feasible");
    if (result.status === "feasible") {
      expect(result.plan.meals[0].components[0].preparationId).toBe("prep-b");
      expect(result.plan.meals[1].components[0]).toEqual(
        expect.objectContaining({
          preparationId: "prep-a",
          batchId: "only-prep-a"
        })
      );
    }
  });

  test("uses global feasibility instead of a greedy allocation that strands a later meal", () => {
    const inventoryOnly = reviewedCandidate({
      preparationId: "prep-inventory-only",
      revisionId: "revision-inventory-only",
      foodId: "food-inventory-only",
      newPortionStrategies: []
    });
    const firstMealOnly = reviewedCandidate({
      preparationId: "prep-first-only",
      revisionId: "revision-first-only",
      foodId: "food-first-only",
      newPortionStrategies: [
        {
          strategyId: "strategy-first-only",
          storageLocation: "refrigerator",
          storageRuleRevisionId: "storage-first-only",
          supportedMealIds: ["meal-1"]
        }
      ]
    });
    const result = planDeterministicWeek(
      baseInput({
        preparations: [inventoryOnly, firstMealOnly],
        ruleRevisionIds: ["eligibility-r1", "storage-r1", "storage-first-only"],
        restrictionSnapshot: [
          {
            foodId: "food-inventory-only",
            status: "allowed",
            version: 1
          },
          { foodId: "food-first-only", status: "allowed", version: 1 }
        ],
        inventory: [
          {
            batchId: "scarce",
            deadlineRuleRevisionId: "storage-r1",
            preparationId: "prep-inventory-only",
            revisionId: "revision-inventory-only",
            location: "refrigerator",
            portions: 1,
            validUntil: "2026-11-05T00:00:00.000Z"
          }
        ]
      })
    );

    expect(result.status).toBe("feasible");
    if (result.status === "feasible") {
      expect(
        result.plan.meals.map((meal) => meal.components[0].preparationId)
      ).toEqual(["prep-first-only", "prep-inventory-only"]);
    }
  });

  test("compares instants by epoch, excludes the exact deadline, and rejects loose dates", () => {
    const offsetResult = planDeterministicWeek(
      baseInput({
        mealCount: 1,
        mealRequests: [baseInput().mealRequests[0]],
        preparations: [reviewedCandidate({ newPortionStrategies: [] })],
        inventory: [
          {
            batchId: "offset-valid",
            deadlineRuleRevisionId: "storage-r1",
            preparationId: "prep-a",
            revisionId: "revision-a",
            location: "refrigerator",
            portions: 1,
            validUntil: "2026-11-03T00:30:00-06:00"
          }
        ]
      })
    );
    expect(offsetResult.status).toBe("feasible");

    const exactBoundary = planDeterministicWeek(
      baseInput({
        mealCount: 1,
        mealRequests: [baseInput().mealRequests[0]],
        preparations: [reviewedCandidate({ newPortionStrategies: [] })],
        inventory: [
          {
            batchId: "exact-boundary",
            deadlineRuleRevisionId: "storage-r1",
            preparationId: "prep-a",
            revisionId: "revision-a",
            location: "refrigerator",
            portions: 1,
            validUntil: baseInput().mealRequests[0].consumeBy
          }
        ]
      })
    );
    expect(exactBoundary).toEqual(
      expect.objectContaining({
        status: "infeasible",
        reason: "storage_infeasible"
      })
    );

    expect(
      planDeterministicWeek(baseInput({ clock: "November 1, 2026" }))
    ).toEqual({
      status: "infeasible",
      reason: "invalid_snapshot"
    });
  });

  test("requires complete meal-level locks and preserves a complete locked meal", () => {
    const second = reviewedCandidate({
      preparationId: "prep-b",
      revisionId: "revision-b",
      foodId: "food-b"
    });
    const lockedMeal = {
      ...baseInput().mealRequests[0],
      componentCount: 2,
      isLocked: true,
      lockedComponents: [
        {
          position: 1,
          preparationId: "prep-b",
          revisionId: "revision-b"
        },
        {
          position: 0,
          preparationId: "prep-a",
          revisionId: "revision-a"
        }
      ]
    };
    const complete = planDeterministicWeek(
      baseInput({
        mealCount: 1,
        mealRequests: [lockedMeal],
        preparations: [reviewedCandidate(), second],
        restrictionSnapshot: [
          { foodId: "food-a", status: "allowed", version: 1 },
          { foodId: "food-b", status: "allowed", version: 1 }
        ]
      })
    );
    expect(complete.status).toBe("feasible");
    if (complete.status === "feasible") {
      expect(
        complete.plan.meals[0].components.map(
          (component) => component.preparationId
        )
      ).toEqual(["prep-a", "prep-b"]);
    }

    const partial = planDeterministicWeek(
      baseInput({
        mealCount: 1,
        mealRequests: [
          {
            ...lockedMeal,
            lockedComponents: [lockedMeal.lockedComponents[0]]
          }
        ],
        preparations: [reviewedCandidate(), second],
        restrictionSnapshot: [
          { foodId: "food-a", status: "allowed", version: 1 },
          { foodId: "food-b", status: "allowed", version: 1 }
        ]
      })
    );
    expect(partial).toEqual({
      status: "infeasible",
      reason: "invalid_snapshot"
    });
  });

  test("never repeats a preparation within one meal", () => {
    const result = planDeterministicWeek(
      baseInput({
        mealCount: 1,
        mealRequests: [{ ...baseInput().mealRequests[0], componentCount: 2 }]
      })
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "infeasible",
        reason: "storage_infeasible",
        mealId: "meal-1",
        position: 0
      })
    );
    expect(result).not.toHaveProperty("plan");
  });

  test("returns typed storage infeasibility and never stretches deadlines", () => {
    const result = planDeterministicWeek(
      baseInput({
        preparations: [
          reviewedCandidate({
            newPortionStrategies: []
          })
        ],
        inventory: [
          {
            batchId: "expired-for-meal",
            deadlineRuleRevisionId: "storage-r1",
            preparationId: "prep-a",
            revisionId: "revision-a",
            location: "refrigerator",
            portions: 4,
            validUntil: "2026-11-03T05:59:59.999Z"
          }
        ]
      })
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "infeasible",
        reason: "storage_infeasible",
        mealId: "meal-1"
      })
    );
    expect(result).not.toHaveProperty("plan");
  });

  test.each([
    ["meal count", baseInput({ mealCount: 99 })],
    ["time zone", baseInput({ timeZone: "Not/A_Time_Zone" })],
    ["rule snapshot", baseInput({ ruleRevisionIds: ["eligibility-r1"] })]
  ])("fails closed for an invalid %s snapshot", (_label, input) => {
    expect(planDeterministicWeek(input)).toEqual({
      status: "infeasible",
      reason: "invalid_snapshot"
    });
  });

  test.each([
    [
      "duplicate skills",
      baseInput({
        skillSnapshot: [
          { skillTagId: "skill-a", status: "observed" },
          { skillTagId: "skill-a", status: "not_observed" }
        ]
      })
    ],
    [
      "duplicate restrictions",
      baseInput({
        restrictionSnapshot: [
          { foodId: "food-a", status: "allowed", version: 1 },
          { foodId: "food-a", status: "blocked", version: 2 }
        ]
      })
    ],
    [
      "duplicate exposures",
      baseInput({
        exposureSnapshot: [
          { foodId: "food-a", state: "familiar" },
          { foodId: "food-a", state: "new" }
        ]
      })
    ],
    [
      "duplicate preparations",
      baseInput({
        preparations: [
          reviewedCandidate(),
          reviewedCandidate({ published: false })
        ]
      })
    ],
    [
      "duplicate batches",
      baseInput({
        inventory: [
          {
            batchId: "same",
            deadlineRuleRevisionId: "storage-r1",
            preparationId: "prep-a",
            revisionId: "revision-a",
            location: "refrigerator",
            portions: 1,
            validUntil: "2026-11-05T00:00:00.000Z"
          },
          {
            batchId: "same",
            deadlineRuleRevisionId: "storage-r1",
            preparationId: "prep-a",
            revisionId: "revision-a",
            location: "refrigerator",
            portions: 2,
            validUntil: "2026-11-06T00:00:00.000Z"
          }
        ]
      })
    ],
    [
      "unreviewed inventory deadline",
      baseInput({
        inventory: [
          {
            batchId: "unreviewed",
            deadlineRuleRevisionId: "missing-rule",
            preparationId: "prep-a",
            revisionId: "revision-a",
            location: "refrigerator",
            portions: 1,
            validUntil: "2026-11-05T00:00:00.000Z"
          }
        ]
      })
    ],
    [
      "blank strategy rule",
      baseInput({
        preparations: [
          reviewedCandidate({
            newPortionStrategies: [
              {
                strategyId: "bad",
                storageLocation: "refrigerator",
                storageRuleRevisionId: "",
                supportedMealIds: ["meal-1"]
              }
            ]
          })
        ]
      })
    ]
  ])(
    "rejects ambiguous or unsupported snapshot identity: %s",
    (_label, input) => {
      expect(planDeterministicWeek(input)).toEqual({
        status: "infeasible",
        reason: "invalid_snapshot"
      });
    }
  );

  test.each([
    [
      "unsupported storage location",
      baseInput({
        preparations: [
          reviewedCandidate({
            newPortionStrategies: [
              {
                strategyId: "unsupported-location",
                storageLocation: "counter" as "refrigerator",
                storageRuleRevisionId: "storage-a",
                supportedMealIds: ["meal-1"]
              }
            ]
          })
        ]
      })
    ],
    [
      "impossible calendar instant",
      baseInput({ clock: "2026-02-30T12:00:00Z" })
    ],
    [
      "invalid preparation preference",
      baseInput({
        preferences: {
          preparationTime: "instant" as "under_15_minutes",
          newFoodPace: "one_per_week"
        }
      })
    ],
    [
      "invalid new-food pace",
      baseInput({
        preferences: {
          preparationTime: "under_15_minutes",
          newFoodPace: "daily" as "one_per_week"
        }
      })
    ],
    [
      "duplicate weekly slot",
      baseInput({
        mealRequests: [
          baseInput().mealRequests[0],
          { ...baseInput().mealRequests[0], mealId: "duplicate-slot" }
        ]
      })
    ],
    [
      "meal outside seven-day window",
      baseInput({
        mealCount: 1,
        mealRequests: [
          {
            ...baseInput().mealRequests[0],
            localDate: "2026-11-09",
            consumeBy: "2026-11-10T06:00:00.000Z"
          }
        ]
      })
    ],
    [
      "past consumption boundary",
      baseInput({
        mealCount: 1,
        mealRequests: [
          {
            ...baseInput().mealRequests[0],
            consumeBy: "2026-11-01T11:59:59.000Z"
          }
        ]
      })
    ],
    [
      "contradictory restriction facts",
      baseInput({
        restrictionSnapshot: [
          { foodId: "food-a", status: "blocked", version: 2 }
        ]
      })
    ],
    [
      "contradictory exposure facts",
      baseInput({
        exposureSnapshot: [{ foodId: "food-a", state: "new" }]
      })
    ]
  ])("fails closed for malformed runtime input: %s", (_label, input) => {
    expect(planDeterministicWeek(input)).toEqual({
      status: "infeasible",
      reason: "invalid_snapshot"
    });
  });

  test("matches the complete normal-week golden result", () => {
    expect(planDeterministicWeek(baseInput())).toMatchInlineSnapshot(`
      {
        "plan": {
          "meals": [
            {
              "components": [
                {
                  "foodId": "food-a",
                  "position": 0,
                  "preparationId": "prep-a",
                  "reasonCodes": [
                    "requires_new_preparation",
                    "adds_variety",
                    "matches_preparation_preference",
                  ],
                  "revisionId": "revision-a",
                  "source": "new_preparation",
                  "strategyId": "strategy-a-refrigerator",
                },
              ],
              "localDate": "2026-11-02",
              "mealId": "meal-1",
              "mealSlot": "breakfast",
            },
            {
              "components": [
                {
                  "foodId": "food-a",
                  "position": 0,
                  "preparationId": "prep-a",
                  "reasonCodes": [
                    "requires_new_preparation",
                    "reuses_preparation",
                    "matches_preparation_preference",
                  ],
                  "revisionId": "revision-a",
                  "source": "new_preparation",
                  "strategyId": "strategy-a-refrigerator",
                },
              ],
              "localDate": "2026-11-03",
              "mealId": "meal-2",
              "mealSlot": "breakfast",
            },
          ],
          "preparationTasks": [
            {
              "freezeRuleRevisionId": undefined,
              "mealIds": [
                "meal-1",
                "meal-2",
              ],
              "portions": 2,
              "preparationId": "prep-a",
              "revisionId": "revision-a",
              "storageLocation": "refrigerator",
              "storageRuleRevisionId": "storage-a",
              "strategyId": "strategy-a-refrigerator",
            },
          ],
          "thawTasks": [],
        },
        "reproducibilityHash": "planner-v1-f81650e8a0ea9e5f54e422f3751e0e3db6440cb5dfa2666a21f71a2327ab7950",
        "ruleRevisionIds": [
          "eligibility-r1",
          "storage-a",
          "storage-r1",
        ],
        "status": "feasible",
      }
    `);
  });

  test("matches complete golden outputs for every required planning scenario", () => {
    const oneMeal = [baseInput().mealRequests[0]];
    const restrictedCandidate = reviewedCandidate({
      restrictionStatus: "blocked"
    });
    const lockedMeal = [
      {
        ...baseInput().mealRequests[0],
        isLocked: true,
        lockedComponents: [
          {
            position: 0,
            preparationId: "prep-a",
            revisionId: "revision-a"
          }
        ]
      }
    ];

    expect({
      normal: planDeterministicWeek(baseInput()),
      restricted: planDeterministicWeek(
        baseInput({ preparations: [restrictedCandidate] })
      ),
      noInventory: planDeterministicWeek(
        baseInput({ mealCount: 1, mealRequests: oneMeal })
      ),
      expiringInventory: planDeterministicWeek(
        baseInput({
          mealCount: 1,
          mealRequests: oneMeal,
          inventory: [
            {
              batchId: "golden-expiring",
              deadlineRuleRevisionId: "storage-r1",
              preparationId: "prep-a",
              revisionId: "revision-a",
              location: "refrigerator",
              portions: 1,
              validUntil: "2026-11-03T07:00:00.000Z"
            }
          ]
        })
      ),
      locked: planDeterministicWeek(
        baseInput({ mealCount: 1, mealRequests: lockedMeal })
      ),
      infeasible: planDeterministicWeek(
        baseInput({
          mealCount: 1,
          mealRequests: oneMeal,
          preparations: [reviewedCandidate({ newPortionStrategies: [] })]
        })
      )
    }).toMatchInlineSnapshot(`
      {
        "expiringInventory": {
          "plan": {
            "meals": [
              {
                "components": [
                  {
                    "batchId": "golden-expiring",
                    "foodId": "food-a",
                    "position": 0,
                    "preparationId": "prep-a",
                    "reasonCodes": [
                      "uses_expiring_refrigerated_inventory",
                      "adds_variety",
                      "matches_preparation_preference",
                    ],
                    "revisionId": "revision-a",
                    "source": "existing_refrigerated",
                  },
                ],
                "localDate": "2026-11-02",
                "mealId": "meal-1",
                "mealSlot": "breakfast",
              },
            ],
            "preparationTasks": [],
            "thawTasks": [],
          },
          "reproducibilityHash": "planner-v1-4046cee402260ea3926371e6e58b6e6373c7726b0b66885ce2d1ba7efaebc6d9",
          "ruleRevisionIds": [
            "eligibility-r1",
            "storage-a",
            "storage-r1",
          ],
          "status": "feasible",
        },
        "infeasible": {
          "mealId": "meal-1",
          "position": 0,
          "preparationId": undefined,
          "reason": "storage_infeasible",
          "status": "infeasible",
        },
        "locked": {
          "plan": {
            "meals": [
              {
                "components": [
                  {
                    "foodId": "food-a",
                    "position": 0,
                    "preparationId": "prep-a",
                    "reasonCodes": [
                      "locked_by_caregiver",
                      "requires_new_preparation",
                      "adds_variety",
                      "matches_preparation_preference",
                    ],
                    "revisionId": "revision-a",
                    "source": "new_preparation",
                    "strategyId": "strategy-a-refrigerator",
                  },
                ],
                "localDate": "2026-11-02",
                "mealId": "meal-1",
                "mealSlot": "breakfast",
              },
            ],
            "preparationTasks": [
              {
                "freezeRuleRevisionId": undefined,
                "mealIds": [
                  "meal-1",
                ],
                "portions": 1,
                "preparationId": "prep-a",
                "revisionId": "revision-a",
                "storageLocation": "refrigerator",
                "storageRuleRevisionId": "storage-a",
                "strategyId": "strategy-a-refrigerator",
              },
            ],
            "thawTasks": [],
          },
          "reproducibilityHash": "planner-v1-5a2f3aa066c2ebd1b998b89131cc0a7cb91be9c565acd6b446d7b41c1b53335a",
          "ruleRevisionIds": [
            "eligibility-r1",
            "storage-a",
            "storage-r1",
          ],
          "status": "feasible",
        },
        "noInventory": {
          "plan": {
            "meals": [
              {
                "components": [
                  {
                    "foodId": "food-a",
                    "position": 0,
                    "preparationId": "prep-a",
                    "reasonCodes": [
                      "requires_new_preparation",
                      "adds_variety",
                      "matches_preparation_preference",
                    ],
                    "revisionId": "revision-a",
                    "source": "new_preparation",
                    "strategyId": "strategy-a-refrigerator",
                  },
                ],
                "localDate": "2026-11-02",
                "mealId": "meal-1",
                "mealSlot": "breakfast",
              },
            ],
            "preparationTasks": [
              {
                "freezeRuleRevisionId": undefined,
                "mealIds": [
                  "meal-1",
                ],
                "portions": 1,
                "preparationId": "prep-a",
                "revisionId": "revision-a",
                "storageLocation": "refrigerator",
                "storageRuleRevisionId": "storage-a",
                "strategyId": "strategy-a-refrigerator",
              },
            ],
            "thawTasks": [],
          },
          "reproducibilityHash": "planner-v1-0e1bbb63de309883b0d2e4a901906d7e59ae6c2dd8f17f94a4a7b358fe49ba10",
          "ruleRevisionIds": [
            "eligibility-r1",
            "storage-a",
            "storage-r1",
          ],
          "status": "feasible",
        },
        "normal": {
          "plan": {
            "meals": [
              {
                "components": [
                  {
                    "foodId": "food-a",
                    "position": 0,
                    "preparationId": "prep-a",
                    "reasonCodes": [
                      "requires_new_preparation",
                      "adds_variety",
                      "matches_preparation_preference",
                    ],
                    "revisionId": "revision-a",
                    "source": "new_preparation",
                    "strategyId": "strategy-a-refrigerator",
                  },
                ],
                "localDate": "2026-11-02",
                "mealId": "meal-1",
                "mealSlot": "breakfast",
              },
              {
                "components": [
                  {
                    "foodId": "food-a",
                    "position": 0,
                    "preparationId": "prep-a",
                    "reasonCodes": [
                      "requires_new_preparation",
                      "reuses_preparation",
                      "matches_preparation_preference",
                    ],
                    "revisionId": "revision-a",
                    "source": "new_preparation",
                    "strategyId": "strategy-a-refrigerator",
                  },
                ],
                "localDate": "2026-11-03",
                "mealId": "meal-2",
                "mealSlot": "breakfast",
              },
            ],
            "preparationTasks": [
              {
                "freezeRuleRevisionId": undefined,
                "mealIds": [
                  "meal-1",
                  "meal-2",
                ],
                "portions": 2,
                "preparationId": "prep-a",
                "revisionId": "revision-a",
                "storageLocation": "refrigerator",
                "storageRuleRevisionId": "storage-a",
                "strategyId": "strategy-a-refrigerator",
              },
            ],
            "thawTasks": [],
          },
          "reproducibilityHash": "planner-v1-f81650e8a0ea9e5f54e422f3751e0e3db6440cb5dfa2666a21f71a2327ab7950",
          "ruleRevisionIds": [
            "eligibility-r1",
            "storage-a",
            "storage-r1",
          ],
          "status": "feasible",
        },
        "restricted": {
          "mealId": "meal-1",
          "position": 0,
          "reason": "no_eligible_candidate",
          "status": "infeasible",
        },
      }
    `);
  });

  test("rejects a maximally shaped resource-short week within a bounded runtime", () => {
    const slots = ["breakfast", "lunch", "dinner"] as const;
    const mealRequests = Array.from({ length: 7 }, (_, day) =>
      slots.map((mealSlot, slotIndex) => ({
        mealId: `meal-${day}-${mealSlot}`,
        localDate: `2026-11-0${day + 1}`,
        mealSlot,
        consumeBy: `2026-11-0${day + 1}T${18 + slotIndex}:00:00.000Z`,
        componentCount: 3,
        isLocked: false,
        lockedComponents: []
      }))
    ).flat();
    const preparations = Array.from({ length: 62 }, (_, index) =>
      reviewedCandidate({
        preparationId: `bounded-prep-${index}`,
        revisionId: `bounded-revision-${index}`,
        foodId: `bounded-food-${index}`,
        newPortionStrategies: []
      })
    );
    const inventory = preparations.map((candidate, index) => ({
      batchId: `bounded-batch-${index}`,
      deadlineRuleRevisionId: "storage-r1",
      preparationId: candidate.preparationId,
      revisionId: candidate.revisionId,
      location: "refrigerator" as const,
      portions: 1,
      validUntil: "2026-11-09T00:00:00.000Z"
    }));
    const startedAt = performance.now();
    const result = planDeterministicWeek(
      baseInput({
        mealCount: 21,
        mealRequests,
        preparations,
        inventory
      })
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "infeasible",
        reason: "storage_infeasible"
      })
    );
    expect(performance.now() - startedAt).toBeLessThan(5_000);
  }, 10_000);

  test("maps reason codes to calm fixed explanations without scores", () => {
    expect(
      explainPlannerReasons([
        "uses_expiring_refrigerated_inventory",
        "reuses_preparation"
      ])
    ).toEqual([
      "Uses a prepared portion while it is still available.",
      "Reuses a preparation to keep the week practical."
    ]);
  });

  test("applies familiarity, variety, quick-backup, and preparation preferences only after filtering", () => {
    const familiar = reviewedCandidate({
      preparationId: "prep-familiar",
      revisionId: "revision-familiar",
      foodId: "food-familiar",
      preparationTime: "flexible"
    });
    const newer = reviewedCandidate({
      preparationId: "prep-new",
      revisionId: "revision-new",
      foodId: "food-new",
      exposureState: "new",
      preparationTime: "under_15_minutes"
    });
    const paired = planDeterministicWeek(
      baseInput({
        mealCount: 1,
        mealRequests: [
          {
            ...baseInput().mealRequests[0],
            componentCount: 2
          }
        ],
        preparations: [newer, familiar],
        restrictionSnapshot: [
          { foodId: "food-familiar", status: "allowed", version: 1 },
          { foodId: "food-new", status: "allowed", version: 1 }
        ],
        exposureSnapshot: [
          { foodId: "food-familiar", state: "familiar" },
          { foodId: "food-new", state: "new" }
        ],
        quickBackupFoodIds: ["food-familiar"]
      })
    );

    expect(paired.status).toBe("feasible");
    if (paired.status === "feasible") {
      expect(
        paired.plan.meals[0].components.map((component) => component.foodId)
      ).toEqual(["food-familiar", "food-new"]);
      expect(paired.plan.meals[0].components[0].reasonCodes).toContain(
        "uses_available_quick_backup"
      );
      expect(paired.plan.meals[0].components[1].reasonCodes).toEqual(
        expect.arrayContaining([
          "pairs_new_with_familiar",
          "matches_preparation_preference"
        ])
      );
    }
  });

  test("property sweep never selects a hard-disqualified candidate", () => {
    for (let mask = 0; mask < 32; mask += 1) {
      const candidates = Array.from({ length: 5 }, (_, index) =>
        reviewedCandidate({
          preparationId: `candidate-${index}`,
          revisionId: `revision-${index}`,
          foodId: `food-${index}`,
          published: (mask & (1 << index)) === 0
        })
      );
      const result = planDeterministicWeek(
        baseInput({
          preparations: candidates,
          restrictionSnapshot: candidates.map((candidate) => ({
            foodId: candidate.foodId,
            status: "allowed",
            version: 1
          }))
        })
      );
      if (result.status === "feasible") {
        for (const component of result.plan.meals.flatMap(
          (meal) => meal.components
        )) {
          expect(
            candidates.find(
              (candidate) => candidate.preparationId === component.preparationId
            )?.published
          ).toBe(true);
        }
      } else {
        expect(mask).toBe(31);
      }
    }
  });

  test.each([
    {
      label: "unpublished",
      candidate: reviewedCandidate({
        preparationId: "unsafe",
        revisionId: "unsafe-revision",
        foodId: "unsafe-food",
        published: false
      })
    },
    {
      label: "candidate restriction",
      candidate: reviewedCandidate({
        preparationId: "unsafe",
        revisionId: "unsafe-revision",
        foodId: "unsafe-food",
        restrictionStatus: "blocked"
      })
    },
    {
      label: "reaction block",
      candidate: reviewedCandidate({
        preparationId: "unsafe",
        revisionId: "unsafe-revision",
        foodId: "unsafe-food",
        reactionBlocked: true
      })
    },
    {
      label: "skill mismatch",
      candidate: reviewedCandidate({
        preparationId: "unsafe",
        revisionId: "unsafe-revision",
        foodId: "unsafe-food",
        requiredSkillTagIds: ["missing-skill"]
      })
    }
  ])(
    "property invariant excludes every $label candidate regardless of favorable soft inputs",
    ({ candidate }) => {
      const safe = reviewedCandidate({
        preparationId: "safe",
        revisionId: "safe-revision",
        foodId: "safe-food",
        exposureState: "new",
        preparationTime: "flexible"
      });
      const result = planDeterministicWeek(
        baseInput({
          preparations: [candidate, safe],
          restrictionSnapshot: [
            {
              foodId: "unsafe-food",
              status: candidate.restrictionStatus,
              version: 1
            },
            { foodId: "safe-food", status: "allowed", version: 1 }
          ],
          exposureSnapshot: [
            { foodId: "unsafe-food", state: "familiar" },
            { foodId: "safe-food", state: "new" }
          ],
          quickBackupFoodIds: ["unsafe-food"],
          inventory: [
            {
              batchId: "unsafe-favorable-inventory",
              deadlineRuleRevisionId: "storage-r1",
              preparationId: "unsafe",
              revisionId: "unsafe-revision",
              location: "refrigerator",
              portions: 2,
              validUntil: "2026-11-05T00:00:00.000Z"
            }
          ]
        })
      );
      expect(result.status).toBe("feasible");
      if (result.status === "feasible") {
        expect(
          result.plan.meals.flatMap((meal) =>
            meal.components.map((component) => component.preparationId)
          )
        ).toEqual(["safe", "safe"]);
      }
    }
  );

  test("property invariant excludes snapshot-restricted and invalid-revision inventory", () => {
    const unsafe = reviewedCandidate({
      preparationId: "unsafe",
      revisionId: "unsafe-revision",
      foodId: "unsafe-food",
      restrictionStatus: "blocked",
      newPortionStrategies: []
    });
    const safe = reviewedCandidate({
      preparationId: "safe",
      revisionId: "safe-revision",
      foodId: "safe-food"
    });
    const result = planDeterministicWeek(
      baseInput({
        preparations: [unsafe, safe],
        restrictionSnapshot: [
          { foodId: "unsafe-food", status: "blocked", version: 3 },
          { foodId: "safe-food", status: "allowed", version: 1 }
        ],
        quickBackupFoodIds: ["unsafe-food"],
        inventory: [
          {
            batchId: "wrong-revision",
            deadlineRuleRevisionId: "storage-r1",
            preparationId: "unsafe",
            revisionId: "retired-revision",
            location: "refrigerator",
            portions: 9,
            validUntil: "2026-12-01T00:00:00.000Z"
          }
        ]
      })
    );

    expect(result.status).toBe("feasible");
    if (result.status === "feasible") {
      expect(
        result.plan.meals.flatMap((meal) =>
          meal.components.map((component) => component.preparationId)
        )
      ).toEqual(["safe", "safe"]);
    }
  });
});
