export type StorageLocation = "refrigerator" | "freezer";
export type StorageStartEventKind = "prepared_or_opened";
export type StorageDeadlineKind =
  "discard_after" | "quality_by" | "informational";

export type ReviewedStorageRule = {
  id: string;
  contentRevisionId: string;
  supportStatus: "supported" | "unsupported";
  deadlineKind: StorageDeadlineKind | null;
  location: StorageLocation | null;
  startEventKind: StorageStartEventKind | null;
  precedence: number;
  durationHours: number | null;
  durationRangeHours: { minimum: number; maximum: number } | null;
  guidance: string | null;
};

type CalculateStorageDeadlineInput = {
  clock: Date;
  startEvent: {
    kind: StorageStartEventKind;
    occurredAt: Date;
  };
  location: StorageLocation;
  rules: ReviewedStorageRule[];
};

export type StorageDeadlineResult =
  | {
      status: "ready";
      storageStatus: "ready" | "use_today" | "expired";
      ruleId: string;
      contentRevisionId: string;
      deadlineKind: "discard_after";
      appliedDurationHours: number;
      reviewedDurationRangeHours: {
        minimum: number;
        maximum: number;
      } | null;
      guidance: string;
      startsAt: string;
      deadlineAt: string;
    }
  | {
      status: "unsupported";
      reason:
        | "no_applicable_rule"
        | "ambiguous_rule_precedence"
        | "invalid_rule"
        | "invalid_time";
    };

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

export function calculateStorageDeadline(
  input: CalculateStorageDeadlineInput
): StorageDeadlineResult {
  if (!isValidDate(input.clock) || !isValidDate(input.startEvent.occurredAt)) {
    return { status: "unsupported", reason: "invalid_time" };
  }

  const candidates = input.rules.filter(
    (rule) =>
      rule.supportStatus === "supported" &&
      rule.deadlineKind === "discard_after" &&
      rule.location === input.location &&
      rule.startEventKind === input.startEvent.kind
  );

  if (candidates.length === 0) {
    return { status: "unsupported", reason: "no_applicable_rule" };
  }

  const highestPrecedence = Math.max(
    ...candidates.map((rule) => rule.precedence)
  );
  const selected = candidates.filter(
    (rule) => rule.precedence === highestPrecedence
  );

  if (selected.length !== 1) {
    return { status: "unsupported", reason: "ambiguous_rule_precedence" };
  }

  const rule = selected[0];
  const range = rule.durationRangeHours;
  const appliedDurationHours = rule.durationHours ?? range?.minimum ?? null;
  const rangeIsValid =
    range === null ||
    (Number.isInteger(range.minimum) &&
      Number.isInteger(range.maximum) &&
      range.minimum > 0 &&
      range.maximum >= range.minimum);

  if (
    !rule.guidance ||
    !Number.isInteger(rule.precedence) ||
    rule.precedence < 0 ||
    !rangeIsValid ||
    appliedDurationHours === null ||
    !Number.isInteger(appliedDurationHours) ||
    appliedDurationHours <= 0 ||
    (range !== null &&
      rule.durationHours !== null &&
      rule.durationHours !== range.minimum)
  ) {
    return { status: "unsupported", reason: "invalid_rule" };
  }

  const startsAt = input.startEvent.occurredAt;
  const deadlineAt = new Date(
    startsAt.getTime() + appliedDurationHours * 60 * 60 * 1000
  );
  const remainingMilliseconds = deadlineAt.getTime() - input.clock.getTime();
  const storageStatus =
    remainingMilliseconds <= 0
      ? "expired"
      : remainingMilliseconds <= 24 * 60 * 60 * 1000
        ? "use_today"
        : "ready";

  return {
    status: "ready",
    storageStatus,
    ruleId: rule.id,
    contentRevisionId: rule.contentRevisionId,
    deadlineKind: "discard_after",
    appliedDurationHours,
    reviewedDurationRangeHours: range,
    guidance: rule.guidance,
    startsAt: startsAt.toISOString(),
    deadlineAt: deadlineAt.toISOString()
  };
}
