import { createHash } from "node:crypto";

export type RestrictionStatus = "allowed" | "blocked" | "reaction_reported";
export type ExposureState = "new" | "familiar" | "unknown";
export type PreparationTime =
  "under_15_minutes" | "under_30_minutes" | "flexible";

export type NewPortionStrategy = {
  strategyId: string;
  storageLocation: "refrigerator" | "freezer";
  storageRuleRevisionId: string;
  supportedMealIds: string[];
  freezeRuleRevisionId?: string;
  thawRuleRevisionId?: string;
  postThawRuleRevisionId?: string;
};

export type PreparationCandidate = {
  preparationId: string;
  revisionId: string;
  foodId: string;
  methodTagIds: string[];
  textureTagIds: string[];
  published: boolean;
  requiredSkillTagIds: string[];
  restrictionStatus: RestrictionStatus;
  reactionBlocked: boolean;
  exposureState: ExposureState;
  preparationTime: PreparationTime;
  newPortionStrategies: NewPortionStrategy[];
};

export type PlannerInput = {
  clock: string;
  timeZone: string;
  mealCount: number;
  ruleRevisionIds: string[];
  mealRequests: Array<{
    mealId: string;
    localDate: string;
    mealSlot: string;
    consumeBy: string;
    componentCount: number;
    isLocked: boolean;
    lockedComponents: Array<{
      position: number;
      preparationId: string;
      revisionId: string;
    }>;
  }>;
  preparations: PreparationCandidate[];
  inventory: Array<{
    batchId: string;
    preparationId: string;
    revisionId: string;
    location: "refrigerator" | "thawed" | "frozen" | "thawing";
    portions: number;
    validUntil: string;
    deadlineRuleRevisionId: string;
    freezeRuleRevisionId?: string;
    thawRuleRevisionId?: string;
    postThawRuleRevisionId?: string;
  }>;
  skillSnapshot: Array<{
    skillTagId: string;
    status: "observed" | "not_observed" | "not_sure";
  }>;
  restrictionSnapshot: Array<{
    foodId: string;
    status: RestrictionStatus;
    version: number;
  }>;
  exposureSnapshot: Array<{ foodId: string; state: ExposureState }>;
  quickBackupFoodIds: string[];
  preferences: {
    preparationTime: PreparationTime;
    newFoodPace: "none" | "one_per_week" | "two_per_week" | "flexible";
  };
};

export type PlannerReasonCode =
  | "locked_by_caregiver"
  | "uses_expiring_refrigerated_inventory"
  | "uses_frozen_inventory"
  | "pairs_new_with_familiar"
  | "reuses_preparation"
  | "adds_variety"
  | "uses_available_quick_backup"
  | "matches_preparation_preference"
  | "requires_new_preparation";

type PlannedSource =
  "existing_refrigerated" | "existing_frozen" | "new_preparation";

type FeasiblePlan = {
  status: "feasible";
  reproducibilityHash: string;
  ruleRevisionIds: string[];
  plan: {
    meals: Array<{
      mealId: string;
      localDate: string;
      mealSlot: string;
      components: Array<{
        position: number;
        preparationId: string;
        revisionId: string;
        foodId: string;
        source: PlannedSource;
        batchId?: string;
        strategyId?: string;
        reasonCodes: PlannerReasonCode[];
      }>;
    }>;
    preparationTasks: Array<{
      preparationId: string;
      revisionId: string;
      strategyId: string;
      storageLocation: "refrigerator" | "freezer";
      storageRuleRevisionId: string;
      freezeRuleRevisionId?: string;
      portions: number;
      mealIds: string[];
    }>;
    thawTasks: Array<{
      mealId: string;
      preparationId: string;
      revisionId: string;
      thawRuleRevisionId: string;
      postThawRuleRevisionId: string;
      batchId?: string;
      strategyId?: string;
    }>;
  };
};

type InfeasiblePlan = {
  status: "infeasible";
  reason:
    | "invalid_snapshot"
    | "no_eligible_candidate"
    | "locked_component_ineligible"
    | "storage_infeasible";
  mealId?: string;
  position?: number;
  preparationId?: string;
};

type InventoryUnit = {
  unitId: string;
  batchId: string;
  preparationId: string;
  revisionId: string;
  location: "refrigerator" | "thawed" | "frozen" | "thawing";
  validUntil: string;
  deadlineRuleRevisionId: string;
  freezeRuleRevisionId?: string;
  thawRuleRevisionId?: string;
  postThawRuleRevisionId?: string;
};

type Allocation =
  | {
      source: "existing_refrigerated";
      unit: InventoryUnit;
    }
  | {
      source: "existing_frozen";
      unit: InventoryUnit;
    }
  | {
      source: "new_preparation";
      strategy: NewPortionStrategy;
    };

type PlanningSlot = {
  meal: PlannerInput["mealRequests"][number];
  position: number;
  lock?: PlannerInput["mealRequests"][number]["lockedComponents"][number];
};

const slotOrder: Record<string, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2
};

const explanations: Record<PlannerReasonCode, string> = {
  locked_by_caregiver: "Keeps a choice you locked.",
  uses_expiring_refrigerated_inventory:
    "Uses a prepared portion while it is still available.",
  uses_frozen_inventory: "Uses a frozen portion already in Kitchen.",
  pairs_new_with_familiar: "Pairs a newer food with a familiar option.",
  reuses_preparation: "Reuses a preparation to keep the week practical.",
  adds_variety: "Adds variety without changing safety requirements.",
  uses_available_quick_backup: "Uses a quick backup marked available.",
  matches_preparation_preference:
    "Fits the preparation-time preference in the profile.",
  requires_new_preparation:
    "Adds preparation work because no valid portion is available."
};

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).sort().join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function reproducibilityHash(input: PlannerInput): string {
  return `planner-v1-${createHash("sha256")
    .update(canonicalize(input))
    .digest("hex")}`;
}

function compareMeal(
  left: PlannerInput["mealRequests"][number],
  right: PlannerInput["mealRequests"][number]
) {
  return (
    left.localDate.localeCompare(right.localDate) ||
    (slotOrder[left.mealSlot] ?? 99) - (slotOrder[right.mealSlot] ?? 99) ||
    left.mealId.localeCompare(right.mealId)
  );
}

function eligibleCandidates(input: PlannerInput): PreparationCandidate[] {
  const restrictions = new Map(
    input.restrictionSnapshot.map((restriction) => [
      restriction.foodId,
      restriction.status
    ])
  );
  const exposures = new Map(
    input.exposureSnapshot.map((exposure) => [exposure.foodId, exposure.state])
  );
  const skills = new Map(
    input.skillSnapshot.map((skill) => [skill.skillTagId, skill.status])
  );
  return input.preparations
    .filter(
      (candidate) =>
        candidate.published &&
        candidate.requiredSkillTagIds.every(
          (skillId) => skills.get(skillId) === "observed"
        ) &&
        candidate.restrictionStatus === "allowed" &&
        restrictions.get(candidate.foodId) === "allowed" &&
        !candidate.reactionBlocked
    )
    .map((candidate) => ({
      ...candidate,
      exposureState: exposures.get(candidate.foodId) ?? "unknown"
    }))
    .sort(
      (left, right) =>
        left.preparationId.localeCompare(right.preparationId) ||
        left.revisionId.localeCompare(right.revisionId)
    );
}

function inventoryUnits(input: PlannerInput): InventoryUnit[] {
  return input.inventory
    .flatMap((batch) =>
      Array.from(
        { length: Math.max(0, Math.floor(batch.portions)) },
        (_, index) => ({
          ...batch,
          unitId: identityKey(batch.batchId, index)
        })
      )
    )
    .filter((unit) => Date.parse(unit.validUntil) > Date.parse(input.clock))
    .sort(
      (left, right) =>
        Date.parse(left.validUntil) - Date.parse(right.validUntil) ||
        left.batchId.localeCompare(right.batchId) ||
        left.unitId.localeCompare(right.unitId)
    );
}

function findAllocations(
  candidate: PreparationCandidate,
  meal: PlannerInput["mealRequests"][number],
  availableInventory: InventoryUnit[]
): Allocation[] {
  const compatible = availableInventory.filter(
    (unit) =>
      unit.preparationId === candidate.preparationId &&
      unit.revisionId === candidate.revisionId &&
      Date.parse(unit.validUntil) > Date.parse(meal.consumeBy)
  );
  const ready = compatible.filter(
    (unit) => unit.location === "refrigerator" || unit.location === "thawed"
  );
  const frozen = compatible.filter(
    (unit) =>
      unit.location === "frozen" &&
      Boolean(unit.freezeRuleRevisionId) &&
      Boolean(unit.thawRuleRevisionId) &&
      Boolean(unit.postThawRuleRevisionId)
  );
  const strategies = [...candidate.newPortionStrategies]
    .filter(
      (strategy) =>
        strategy.supportedMealIds.includes(meal.mealId) &&
        (strategy.storageLocation === "refrigerator" ||
          (Boolean(strategy.freezeRuleRevisionId) &&
            Boolean(strategy.thawRuleRevisionId) &&
            Boolean(strategy.postThawRuleRevisionId)))
    )
    .sort(
      (left, right) =>
        (left.storageLocation === "refrigerator" ? 0 : 1) -
          (right.storageLocation === "refrigerator" ? 0 : 1) ||
        left.strategyId.localeCompare(right.strategyId)
    );
  return [
    ...ready.map((unit): Allocation => ({
      source: "existing_refrigerated",
      unit
    })),
    ...frozen.map((unit): Allocation => ({ source: "existing_frozen", unit })),
    ...strategies.map((strategy): Allocation => ({
      source: "new_preparation",
      strategy
    }))
  ];
}

function identityKey(...parts: unknown[]): string {
  return JSON.stringify(parts);
}

function inventoryAfterAllocation(
  inventory: InventoryUnit[],
  allocation: Allocation
): InventoryUnit[] {
  if (allocation.source === "new_preparation") return inventory;
  return inventory.filter((unit) => unit.unitId !== allocation.unit.unitId);
}

function canCompleteSlots(
  slots: PlanningSlot[],
  inventory: InventoryUnit[],
  candidates: PreparationCandidate[],
  initiallySelectedByMeal: Map<string, Set<string>> = new Map()
): boolean {
  if (slots.length === 0) return true;

  type Edge = { to: string; reverse: number; capacity: number };
  const graph = new Map<string, Edge[]>();
  const addEdge = (from: string, to: string, capacity: number) => {
    const forward = graph.get(from) ?? [];
    const reverse = graph.get(to) ?? [];
    forward.push({ to, reverse: reverse.length, capacity });
    reverse.push({ to: from, reverse: forward.length - 1, capacity: 0 });
    graph.set(from, forward);
    graph.set(to, reverse);
  };
  const source = "source";
  const sink = "sink";
  const meals = [
    ...new Map(slots.map((slot) => [slot.meal.mealId, slot.meal])).values()
  ];

  for (const index of slots.keys()) {
    addEdge(identityKey("slot", index), sink, 1);
  }

  for (const candidate of candidates) {
    for (const meal of meals) {
      if (
        initiallySelectedByMeal.get(meal.mealId)?.has(candidate.preparationId)
      ) {
        continue;
      }
      const compatibleSlots = slots
        .map((slot, index) => ({ slot, index }))
        .filter(
          ({ slot }) =>
            slot.meal.mealId === meal.mealId &&
            (!slot.lock ||
              (slot.lock.preparationId === candidate.preparationId &&
                slot.lock.revisionId === candidate.revisionId))
        );
      if (compatibleSlots.length === 0) continue;

      const candidateIn = identityKey(
        "candidate-meal-in",
        candidate.preparationId,
        candidate.revisionId,
        meal.mealId
      );
      const candidateOut = identityKey(
        "candidate-meal-out",
        candidate.preparationId,
        candidate.revisionId,
        meal.mealId
      );
      addEdge(candidateIn, candidateOut, 1);
      for (const { index } of compatibleSlots) {
        addEdge(candidateOut, identityKey("slot", index), 1);
      }

      if (findAllocations(candidate, meal, []).length > 0) {
        const newResource = identityKey(
          "new",
          candidate.preparationId,
          candidate.revisionId,
          meal.mealId
        );
        addEdge(source, newResource, 1);
        addEdge(newResource, candidateIn, 1);
      }
    }
  }

  for (const unit of inventory) {
    if (unit.location === "thawing") continue;
    const unitNode = identityKey("inventory", unit.unitId);
    addEdge(source, unitNode, 1);
    for (const candidate of candidates) {
      if (
        candidate.preparationId !== unit.preparationId ||
        candidate.revisionId !== unit.revisionId
      ) {
        continue;
      }
      for (const meal of meals) {
        if (
          initiallySelectedByMeal
            .get(meal.mealId)
            ?.has(candidate.preparationId) ||
          Date.parse(unit.validUntil) <= Date.parse(meal.consumeBy)
        ) {
          continue;
        }
        addEdge(
          unitNode,
          identityKey(
            "candidate-meal-in",
            candidate.preparationId,
            candidate.revisionId,
            meal.mealId
          ),
          1
        );
      }
    }
  }

  let flow = 0;
  while (flow < slots.length) {
    const queue = [source];
    const previous = new Map<string, { node: string; edgeIndex: number }>();
    previous.set(source, { node: "", edgeIndex: -1 });
    for (
      let cursor = 0;
      cursor < queue.length && !previous.has(sink);
      cursor += 1
    ) {
      const node = queue[cursor];
      for (const [edgeIndex, edge] of (graph.get(node) ?? []).entries()) {
        if (edge.capacity <= 0 || previous.has(edge.to)) continue;
        previous.set(edge.to, { node, edgeIndex });
        queue.push(edge.to);
      }
    }
    if (!previous.has(sink)) return false;
    let node = sink;
    while (node !== source) {
      const step = previous.get(node)!;
      const edge = graph.get(step.node)![step.edgeIndex];
      edge.capacity -= 1;
      graph.get(node)![edge.reverse].capacity += 1;
      node = step.node;
    }
    flow += 1;
  }
  return true;
}

function preferenceRank(
  candidate: PreparationCandidate,
  preferred: PreparationTime
): number {
  const rank: Record<PreparationTime, number> = {
    under_15_minutes: 0,
    under_30_minutes: 1,
    flexible: 2
  };
  return rank[candidate.preparationTime] <= rank[preferred] ? 0 : 1;
}

function compareTuple(
  left: Array<number | string>,
  right: Array<number | string>
) {
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (leftValue === rightValue) continue;
    return leftValue < rightValue ? -1 : 1;
  }
  return 0;
}

function minimumUsage(tags: string[], usage: Map<string, number>): number {
  return tags.length === 0
    ? 0
    : Math.min(...tags.map((tag) => usage.get(tag) ?? 0));
}

function newFoodTarget(
  pace: PlannerInput["preferences"]["newFoodPace"]
): number {
  if (pace === "none") return 0;
  if (pace === "one_per_week") return 1;
  if (pace === "two_per_week") return 2;
  return Number.MAX_SAFE_INTEGER;
}

function hasValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

const instantPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function isNonemptyId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = instantPattern.exec(value);
  if (!match) return false;
  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second,
    fraction,
    zone,
    ,
    offsetHour,
    offsetMinute
  ] = match;
  const [yearValue, monthValue, dayValue, hourValue, minuteValue, secondValue] =
    [year, month, day, hour, minute, second].map(Number);
  if (
    hourValue > 23 ||
    minuteValue > 59 ||
    secondValue > 59 ||
    (zone !== "Z" &&
      (Number(offsetHour) > 14 ||
        Number(offsetMinute) > 59 ||
        (Number(offsetHour) === 14 && Number(offsetMinute) !== 0)))
  ) {
    return false;
  }
  const localFields = new Date(
    Date.UTC(
      yearValue,
      monthValue - 1,
      dayValue,
      hourValue,
      minuteValue,
      secondValue,
      Number((fraction ?? "").padEnd(3, "0"))
    )
  );
  return (
    localFields.getUTCFullYear() === yearValue &&
    localFields.getUTCMonth() === monthValue - 1 &&
    localFields.getUTCDate() === dayValue &&
    Number.isFinite(Date.parse(value))
  );
}

function isLocalDate(value: unknown): value is string {
  if (typeof value !== "string" || !localDatePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function hasUniqueValues(values: string[]): boolean {
  return new Set(values).size === values.length;
}

function localDateForInstant(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(instant));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function addLocalDays(localDate: string, days: number): string {
  const date = new Date(`${localDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function hasValidSnapshot(input: PlannerInput): boolean {
  const mealIds = input.mealRequests.map((meal) => meal.mealId);
  const preparationKeys = input.preparations.map(
    (candidate) => candidate.preparationId
  );
  const strategyIds = input.preparations.flatMap((candidate) =>
    candidate.newPortionStrategies.map((strategy) =>
      identityKey(
        candidate.preparationId,
        candidate.revisionId,
        strategy.strategyId
      )
    )
  );
  const ruleIds = input.ruleRevisionIds;

  if (
    !isInstant(input.clock) ||
    !isNonemptyId(input.timeZone) ||
    !hasValidTimeZone(input.timeZone) ||
    !Number.isInteger(input.mealCount) ||
    input.mealCount < 1 ||
    input.mealCount > 21 ||
    input.mealCount !== input.mealRequests.length ||
    input.preparations.length < 1 ||
    input.preparations.length > 100 ||
    input.inventory.length > 100 ||
    input.inventory.reduce((sum, batch) => sum + batch.portions, 0) > 500 ||
    input.skillSnapshot.length > 100 ||
    input.restrictionSnapshot.length > 100 ||
    input.exposureSnapshot.length > 100 ||
    input.quickBackupFoodIds.length > 100 ||
    input.ruleRevisionIds.length > 500 ||
    !hasUniqueValues(mealIds) ||
    !hasUniqueValues(preparationKeys) ||
    !hasUniqueValues(strategyIds) ||
    !hasUniqueValues(ruleIds) ||
    ruleIds.length === 0 ||
    ruleIds.some((ruleId) => !isNonemptyId(ruleId)) ||
    referencedRuleIds(input).some(
      (ruleId) => !isNonemptyId(ruleId) || !ruleIds.includes(ruleId)
    ) ||
    !hasUniqueValues(input.skillSnapshot.map((skill) => skill.skillTagId)) ||
    !hasUniqueValues(
      input.restrictionSnapshot.map((restriction) => restriction.foodId)
    ) ||
    !hasUniqueValues(
      input.exposureSnapshot.map((exposure) => exposure.foodId)
    ) ||
    !hasUniqueValues(input.inventory.map((batch) => batch.batchId)) ||
    !hasUniqueValues(input.quickBackupFoodIds)
  ) {
    return false;
  }

  const localClockDate = localDateForInstant(input.clock, input.timeZone);
  const lastWeekDate = addLocalDays(localClockDate, 6);
  if (
    !hasUniqueValues(
      input.mealRequests.map((meal) =>
        identityKey(meal.localDate, meal.mealSlot)
      )
    ) ||
    !["under_15_minutes", "under_30_minutes", "flexible"].includes(
      input.preferences.preparationTime
    ) ||
    !["none", "one_per_week", "two_per_week", "flexible"].includes(
      input.preferences.newFoodPace
    )
  ) {
    return false;
  }

  if (
    input.skillSnapshot.some(
      (skill) =>
        !isNonemptyId(skill.skillTagId) ||
        !["observed", "not_observed", "not_sure"].includes(skill.status)
    ) ||
    input.restrictionSnapshot.some(
      (restriction) =>
        !isNonemptyId(restriction.foodId) ||
        !["allowed", "blocked", "reaction_reported"].includes(
          restriction.status
        ) ||
        !Number.isInteger(restriction.version) ||
        restriction.version < 1
    ) ||
    input.exposureSnapshot.some(
      (exposure) =>
        !isNonemptyId(exposure.foodId) ||
        !["new", "familiar", "unknown"].includes(exposure.state)
    ) ||
    input.quickBackupFoodIds.some((foodId) => !isNonemptyId(foodId))
  ) {
    return false;
  }

  if (
    input.mealRequests.some((meal) => {
      const positions = meal.lockedComponents.map((lock) => lock.position);
      const lockedPreparationIds = meal.lockedComponents.map(
        (lock) => lock.preparationId
      );
      return (
        !isNonemptyId(meal.mealId) ||
        !isLocalDate(meal.localDate) ||
        !["breakfast", "lunch", "dinner"].includes(meal.mealSlot) ||
        !isInstant(meal.consumeBy) ||
        Date.parse(meal.consumeBy) <= Date.parse(input.clock) ||
        meal.localDate < localClockDate ||
        meal.localDate > lastWeekDate ||
        ![meal.localDate, addLocalDays(meal.localDate, 1)].includes(
          localDateForInstant(meal.consumeBy, input.timeZone)
        ) ||
        !Number.isInteger(meal.componentCount) ||
        meal.componentCount < 1 ||
        meal.componentCount > 3 ||
        typeof meal.isLocked !== "boolean" ||
        !hasUniqueValues(positions.map(String)) ||
        !hasUniqueValues(lockedPreparationIds) ||
        positions.some(
          (position) =>
            !Number.isInteger(position) ||
            position < 0 ||
            position >= meal.componentCount
        ) ||
        meal.lockedComponents.some(
          (lock) =>
            !isNonemptyId(lock.preparationId) || !isNonemptyId(lock.revisionId)
        ) ||
        (meal.isLocked &&
          (meal.lockedComponents.length !== meal.componentCount ||
            Array.from(
              { length: meal.componentCount },
              (_, index) => index
            ).some((position) => !positions.includes(position))))
      );
    })
  ) {
    return false;
  }

  if (
    input.preparations.some(
      (candidate) =>
        !isNonemptyId(candidate.preparationId) ||
        !isNonemptyId(candidate.revisionId) ||
        !isNonemptyId(candidate.foodId) ||
        typeof candidate.published !== "boolean" ||
        typeof candidate.reactionBlocked !== "boolean" ||
        !["allowed", "blocked", "reaction_reported"].includes(
          candidate.restrictionStatus
        ) ||
        !["new", "familiar", "unknown"].includes(candidate.exposureState) ||
        !["under_15_minutes", "under_30_minutes", "flexible"].includes(
          candidate.preparationTime
        ) ||
        !hasUniqueValues(candidate.methodTagIds) ||
        !hasUniqueValues(candidate.textureTagIds) ||
        !hasUniqueValues(candidate.requiredSkillTagIds) ||
        candidate.methodTagIds.length > 50 ||
        candidate.textureTagIds.length > 50 ||
        candidate.requiredSkillTagIds.length > 50 ||
        candidate.newPortionStrategies.length > 21 ||
        [
          ...candidate.methodTagIds,
          ...candidate.textureTagIds,
          ...candidate.requiredSkillTagIds
        ].some((tagId) => !isNonemptyId(tagId)) ||
        candidate.newPortionStrategies.some(
          (strategy) =>
            !isNonemptyId(strategy.strategyId) ||
            !["refrigerator", "freezer"].includes(strategy.storageLocation) ||
            !isNonemptyId(strategy.storageRuleRevisionId) ||
            !hasUniqueValues(strategy.supportedMealIds) ||
            strategy.supportedMealIds.length === 0 ||
            strategy.supportedMealIds.some((mealId) => !isNonemptyId(mealId)) ||
            (strategy.storageLocation === "freezer" &&
              (!isNonemptyId(strategy.freezeRuleRevisionId) ||
                !isNonemptyId(strategy.thawRuleRevisionId) ||
                !isNonemptyId(strategy.postThawRuleRevisionId))) ||
            [
              strategy.freezeRuleRevisionId,
              strategy.thawRuleRevisionId,
              strategy.postThawRuleRevisionId
            ].some((ruleId) => ruleId !== undefined && !isNonemptyId(ruleId))
        )
    )
  ) {
    return false;
  }

  const restrictionByFood = new Map(
    input.restrictionSnapshot.map((restriction) => [
      restriction.foodId,
      restriction.status
    ])
  );
  const exposureByFood = new Map(
    input.exposureSnapshot.map((exposure) => [exposure.foodId, exposure.state])
  );
  if (
    input.preparations.some(
      (candidate) =>
        restrictionByFood.get(candidate.foodId) !==
          candidate.restrictionStatus ||
        exposureByFood.get(candidate.foodId) !== candidate.exposureState
    )
  ) {
    return false;
  }

  return !input.inventory.some(
    (batch) =>
      !isNonemptyId(batch.batchId) ||
      !isNonemptyId(batch.preparationId) ||
      !isNonemptyId(batch.revisionId) ||
      !["refrigerator", "thawed", "frozen", "thawing"].includes(
        batch.location
      ) ||
      !Number.isInteger(batch.portions) ||
      batch.portions < 0 ||
      batch.portions > 99 ||
      !isInstant(batch.validUntil) ||
      !isNonemptyId(batch.deadlineRuleRevisionId) ||
      (batch.location === "frozen" &&
        (!isNonemptyId(batch.freezeRuleRevisionId) ||
          !isNonemptyId(batch.thawRuleRevisionId) ||
          !isNonemptyId(batch.postThawRuleRevisionId))) ||
      [
        batch.freezeRuleRevisionId,
        batch.thawRuleRevisionId,
        batch.postThawRuleRevisionId
      ].some((ruleId) => ruleId !== undefined && !isNonemptyId(ruleId))
  );
}

function referencedRuleIds(input: PlannerInput): string[] {
  return input.preparations
    .flatMap((candidate) =>
      candidate.newPortionStrategies.flatMap((strategy) => [
        strategy.storageRuleRevisionId,
        strategy.freezeRuleRevisionId,
        strategy.thawRuleRevisionId,
        strategy.postThawRuleRevisionId
      ])
    )
    .concat(
      input.inventory.flatMap((batch) => [
        batch.deadlineRuleRevisionId,
        batch.freezeRuleRevisionId,
        batch.thawRuleRevisionId,
        batch.postThawRuleRevisionId
      ])
    )
    .filter((value): value is string => Boolean(value));
}

export function explainPlannerReasons(
  reasonCodes: PlannerReasonCode[]
): string[] {
  return reasonCodes.map((reason) => explanations[reason]);
}

export function planDeterministicWeek(
  input: PlannerInput
): FeasiblePlan | InfeasiblePlan {
  if (!hasValidSnapshot(input)) {
    return { status: "infeasible", reason: "invalid_snapshot" };
  }

  const candidates = eligibleCandidates(input);
  const candidateByIdentity = new Map(
    candidates.map((candidate) => [
      identityKey(candidate.preparationId, candidate.revisionId),
      candidate
    ])
  );
  const meals = [...input.mealRequests].sort(compareMeal);
  const availableInventory = inventoryUnits(input);
  const usedPreparation = new Map<string, number>();
  const usedFood = new Map<string, number>();
  const usedMethod = new Map<string, number>();
  const usedTexture = new Map<string, number>();
  const usedNewFoods = new Set<string>();
  const quickBackups = new Set(input.quickBackupFoodIds);
  const plannedMeals: FeasiblePlan["plan"]["meals"] = [];
  const preparationTasks = new Map<
    string,
    FeasiblePlan["plan"]["preparationTasks"][number]
  >();
  const thawTasks: FeasiblePlan["plan"]["thawTasks"] = [];
  const allSlots: PlanningSlot[] = meals.flatMap((meal) =>
    Array.from({ length: meal.componentCount }, (_, position) => ({
      meal,
      position,
      lock: meal.lockedComponents.find(
        (component) => component.position === position
      )
    }))
  );
  for (const slot of allSlots) {
    if (
      slot.lock &&
      !candidateByIdentity.has(
        identityKey(slot.lock.preparationId, slot.lock.revisionId)
      )
    ) {
      return {
        status: "infeasible",
        reason: "locked_component_ineligible",
        mealId: slot.meal.mealId,
        position: slot.position,
        preparationId: slot.lock.preparationId
      };
    }
  }
  if (candidates.length === 0) {
    const firstSlot = allSlots[0];
    return {
      status: "infeasible",
      reason: "no_eligible_candidate",
      mealId: firstSlot.meal.mealId,
      position: firstSlot.position
    };
  }
  if (!canCompleteSlots(allSlots, availableInventory, candidates)) {
    const firstSlot = allSlots[0];
    return {
      status: "infeasible",
      reason: "storage_infeasible",
      mealId: firstSlot.meal.mealId,
      position: firstSlot.position,
      preparationId: firstSlot.lock?.preparationId
    };
  }
  let slotIndex = 0;
  let previousPlate = "";

  for (const meal of meals) {
    const components: FeasiblePlan["plan"]["meals"][number]["components"] = [];
    for (let position = 0; position < meal.componentCount; position += 1) {
      const lock = meal.lockedComponents.find(
        (component) => component.position === position
      );
      const pool = lock
        ? [
            candidateByIdentity.get(
              identityKey(lock.preparationId, lock.revisionId)
            )
          ].filter(
            (candidate): candidate is PreparationCandidate =>
              candidate !== undefined
          )
        : candidates.filter(
            (candidate) =>
              !components.some(
                (component) =>
                  component.preparationId === candidate.preparationId
              )
          );
      if (pool.length === 0) {
        return {
          status: "infeasible",
          reason: lock
            ? "locked_component_ineligible"
            : "no_eligible_candidate",
          mealId: meal.mealId,
          position,
          preparationId: lock?.preparationId
        };
      }

      const options = pool.flatMap((candidate) =>
        findAllocations(candidate, meal, availableInventory).map(
          (allocation) => ({ candidate, allocation })
        )
      );
      if (options.length === 0) {
        return {
          status: "infeasible",
          reason: "storage_infeasible",
          mealId: meal.mealId,
          position,
          preparationId: lock?.preparationId
        };
      }

      const hasFamiliar = components.some((component) => {
        const selected = candidateByIdentity.get(
          identityKey(component.preparationId, component.revisionId)
        );
        return selected?.exposureState === "familiar";
      });
      options.sort((left, right) => {
        const tuple = ({
          candidate,
          allocation
        }: (typeof options)[number]): Array<number | string> => {
          const sourceRank =
            allocation.source === "existing_refrigerated"
              ? 0
              : allocation.source === "existing_frozen"
                ? 1
                : 2;
          const exactPlate =
            previousPlate ===
            [
              ...components.map((component) => component.preparationId),
              candidate.preparationId
            ]
              .sort()
              .join("|")
              ? 1
              : 0;
          return [
            sourceRank,
            allocation.source === "existing_refrigerated"
              ? Date.parse(allocation.unit.validUntil)
              : 0,
            candidate.exposureState === "new" && hasFamiliar ? 0 : 1,
            exactPlate,
            usedPreparation.has(candidate.preparationId) ? 0 : 1,
            usedFood.get(candidate.foodId) ?? 0,
            candidate.exposureState === "new" &&
            !usedNewFoods.has(candidate.foodId) &&
            usedNewFoods.size >= newFoodTarget(input.preferences.newFoodPace)
              ? 1
              : 0,
            minimumUsage(candidate.methodTagIds, usedMethod),
            minimumUsage(candidate.textureTagIds, usedTexture),
            quickBackups.has(candidate.foodId) ? 0 : 1,
            preferenceRank(candidate, input.preferences.preparationTime),
            candidate.preparationId,
            candidate.revisionId
          ];
        };
        return compareTuple(tuple(left), tuple(right));
      });
      const selectedByMeal = new Map<string, Set<string>>([
        [
          meal.mealId,
          new Set(components.map((component) => component.preparationId))
        ]
      ]);
      const selected = options.find(({ candidate, allocation }) => {
        const nextSelected = new Map(selectedByMeal);
        nextSelected.set(
          meal.mealId,
          new Set([
            ...(selectedByMeal.get(meal.mealId) ?? []),
            candidate.preparationId
          ])
        );
        return canCompleteSlots(
          allSlots.slice(slotIndex + 1),
          inventoryAfterAllocation(availableInventory, allocation),
          candidates,
          nextSelected
        );
      });
      if (!selected) {
        return {
          status: "infeasible",
          reason: "storage_infeasible",
          mealId: meal.mealId,
          position,
          preparationId: lock?.preparationId
        };
      }
      const { candidate, allocation } = selected;
      const reasonCodes: PlannerReasonCode[] = [];
      if (lock) reasonCodes.push("locked_by_caregiver");
      if (allocation.source === "existing_refrigerated") {
        reasonCodes.push("uses_expiring_refrigerated_inventory");
      } else if (allocation.source === "existing_frozen") {
        reasonCodes.push("uses_frozen_inventory");
      } else {
        reasonCodes.push("requires_new_preparation");
      }
      if (candidate.exposureState === "new" && hasFamiliar) {
        reasonCodes.push("pairs_new_with_familiar");
      }
      if (usedPreparation.has(candidate.preparationId)) {
        reasonCodes.push("reuses_preparation");
      } else {
        reasonCodes.push("adds_variety");
      }
      if (quickBackups.has(candidate.foodId)) {
        reasonCodes.push("uses_available_quick_backup");
      }
      if (preferenceRank(candidate, input.preferences.preparationTime) === 0) {
        reasonCodes.push("matches_preparation_preference");
      }

      const component: (typeof components)[number] = {
        position,
        preparationId: candidate.preparationId,
        revisionId: candidate.revisionId,
        foodId: candidate.foodId,
        source: allocation.source,
        reasonCodes
      };
      if (
        allocation.source === "existing_refrigerated" ||
        allocation.source === "existing_frozen"
      ) {
        component.batchId = allocation.unit.batchId;
        const unitIndex = availableInventory.findIndex(
          (unit) => unit.unitId === allocation.unit.unitId
        );
        availableInventory.splice(unitIndex, 1);
        if (allocation.source === "existing_frozen") {
          thawTasks.push({
            mealId: meal.mealId,
            preparationId: candidate.preparationId,
            revisionId: candidate.revisionId,
            batchId: allocation.unit.batchId,
            thawRuleRevisionId: allocation.unit.thawRuleRevisionId!,
            postThawRuleRevisionId: allocation.unit.postThawRuleRevisionId!
          });
        }
      } else {
        component.strategyId = allocation.strategy.strategyId;
        const taskKey = identityKey(
          candidate.preparationId,
          candidate.revisionId,
          allocation.strategy.strategyId
        );
        const task = preparationTasks.get(taskKey) ?? {
          preparationId: candidate.preparationId,
          revisionId: candidate.revisionId,
          strategyId: allocation.strategy.strategyId,
          storageLocation: allocation.strategy.storageLocation,
          storageRuleRevisionId: allocation.strategy.storageRuleRevisionId,
          freezeRuleRevisionId: allocation.strategy.freezeRuleRevisionId,
          portions: 0,
          mealIds: []
        };
        task.portions += 1;
        task.mealIds.push(meal.mealId);
        preparationTasks.set(taskKey, task);
        if (allocation.strategy.storageLocation === "freezer") {
          thawTasks.push({
            mealId: meal.mealId,
            preparationId: candidate.preparationId,
            revisionId: candidate.revisionId,
            strategyId: allocation.strategy.strategyId,
            thawRuleRevisionId: allocation.strategy.thawRuleRevisionId!,
            postThawRuleRevisionId: allocation.strategy.postThawRuleRevisionId!
          });
        }
      }
      components.push(component);
      usedPreparation.set(
        candidate.preparationId,
        (usedPreparation.get(candidate.preparationId) ?? 0) + 1
      );
      usedFood.set(candidate.foodId, (usedFood.get(candidate.foodId) ?? 0) + 1);
      if (candidate.exposureState === "new") {
        usedNewFoods.add(candidate.foodId);
      }
      for (const tag of candidate.methodTagIds) {
        usedMethod.set(tag, (usedMethod.get(tag) ?? 0) + 1);
      }
      for (const tag of candidate.textureTagIds) {
        usedTexture.set(tag, (usedTexture.get(tag) ?? 0) + 1);
      }
      slotIndex += 1;
    }
    previousPlate = components
      .map((component) => component.preparationId)
      .sort()
      .join("|");
    plannedMeals.push({
      mealId: meal.mealId,
      localDate: meal.localDate,
      mealSlot: meal.mealSlot,
      components
    });
  }

  return {
    status: "feasible",
    reproducibilityHash: reproducibilityHash(input),
    ruleRevisionIds: [...input.ruleRevisionIds].sort(),
    plan: {
      meals: plannedMeals,
      preparationTasks: [...preparationTasks.values()]
        .map((task) => ({ ...task, mealIds: [...task.mealIds].sort() }))
        .sort(
          (left, right) =>
            left.preparationId.localeCompare(right.preparationId) ||
            left.strategyId.localeCompare(right.strategyId)
        ),
      thawTasks: thawTasks.sort(
        (left, right) =>
          left.mealId.localeCompare(right.mealId) ||
          left.preparationId.localeCompare(right.preparationId)
      )
    }
  };
}
