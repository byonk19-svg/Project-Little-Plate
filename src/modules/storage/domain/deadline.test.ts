import { describe, expect, test } from "vitest";

import { calculateStorageDeadline } from "./deadline";

describe("calculateStorageDeadline", () => {
  test("a reviewed range uses its conservative lower endpoint", () => {
    const result = calculateStorageDeadline({
      clock: new Date("2026-07-28T18:00:00.000Z"),
      startEvent: {
        kind: "prepared_or_opened",
        occurredAt: new Date("2026-07-28T12:00:00.000Z")
      },
      location: "refrigerator",
      rules: [
        {
          id: "rule-range",
          contentRevisionId: "revision-1",
          supportStatus: "supported",
          deadlineKind: "discard_after",
          location: "refrigerator",
          startEventKind: "prepared_or_opened",
          precedence: 0,
          durationHours: 24,
          durationRangeHours: { minimum: 24, maximum: 48 },
          guidance: "SYNTHETIC REVIEWED TEST GUIDANCE"
        }
      ]
    });

    expect(result).toEqual({
      status: "ready",
      storageStatus: "use_today",
      ruleId: "rule-range",
      contentRevisionId: "revision-1",
      deadlineKind: "discard_after",
      appliedDurationHours: 24,
      reviewedDurationRangeHours: { minimum: 24, maximum: 48 },
      guidance: "SYNTHETIC REVIEWED TEST GUIDANCE",
      startsAt: "2026-07-28T12:00:00.000Z",
      deadlineAt: "2026-07-29T12:00:00.000Z"
    });
  });

  test("a more specific reviewed rule wins by explicit precedence", () => {
    const baseRule = {
      contentRevisionId: "revision-1",
      supportStatus: "supported" as const,
      deadlineKind: "discard_after" as const,
      location: "refrigerator" as const,
      startEventKind: "prepared_or_opened" as const,
      durationRangeHours: null,
      guidance: "SYNTHETIC REVIEWED TEST GUIDANCE"
    };

    const result = calculateStorageDeadline({
      clock: new Date("2026-07-28T12:00:00.000Z"),
      startEvent: {
        kind: "prepared_or_opened",
        occurredAt: new Date("2026-07-28T12:00:00.000Z")
      },
      location: "refrigerator",
      rules: [
        {
          ...baseRule,
          id: "general-rule",
          precedence: 0,
          durationHours: 48
        },
        {
          ...baseRule,
          id: "specific-rule",
          precedence: 1,
          durationHours: 12
        }
      ]
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "ready",
        ruleId: "specific-rule",
        appliedDurationHours: 12,
        deadlineAt: "2026-07-29T00:00:00.000Z"
      })
    );
  });

  test("missing and ambiguous reviewed inputs fail closed", () => {
    const input = {
      clock: new Date("2026-07-28T12:00:00.000Z"),
      startEvent: {
        kind: "prepared_or_opened" as const,
        occurredAt: new Date("2026-07-28T12:00:00.000Z")
      },
      location: "refrigerator" as const
    };
    const applicableRule = {
      id: "rule-1",
      contentRevisionId: "revision-1",
      supportStatus: "supported" as const,
      deadlineKind: "discard_after" as const,
      location: "refrigerator" as const,
      startEventKind: "prepared_or_opened" as const,
      precedence: 0,
      durationHours: 24,
      durationRangeHours: null,
      guidance: "SYNTHETIC REVIEWED TEST GUIDANCE"
    };

    expect(calculateStorageDeadline({ ...input, rules: [] })).toEqual({
      status: "unsupported",
      reason: "no_applicable_rule"
    });
    expect(
      calculateStorageDeadline({
        ...input,
        rules: [applicableRule, { ...applicableRule, id: "rule-2" }]
      })
    ).toEqual({
      status: "unsupported",
      reason: "ambiguous_rule_precedence"
    });
    expect(
      calculateStorageDeadline({
        ...input,
        rules: [{ ...applicableRule, guidance: null }]
      })
    ).toEqual({
      status: "unsupported",
      reason: "invalid_rule"
    });
  });

  test.each([
    {
      name: "spring-forward",
      startsAt: "2026-03-08T06:30:00.000Z",
      deadlineAt: "2026-03-09T06:30:00.000Z"
    },
    {
      name: "fall-back",
      startsAt: "2026-11-01T05:30:00.000Z",
      deadlineAt: "2026-11-02T05:30:00.000Z"
    }
  ])(
    "$name keeps a 24-hour deadline in elapsed UTC time",
    ({ startsAt, deadlineAt }) => {
      const rule = {
        id: "rule-exact",
        contentRevisionId: "revision-1",
        supportStatus: "supported" as const,
        deadlineKind: "discard_after" as const,
        location: "refrigerator" as const,
        startEventKind: "prepared_or_opened" as const,
        precedence: 0,
        durationHours: 24,
        durationRangeHours: null,
        guidance: "SYNTHETIC REVIEWED TEST GUIDANCE"
      };

      const beforeBoundary = calculateStorageDeadline({
        clock: new Date(new Date(deadlineAt).getTime() - 1),
        startEvent: {
          kind: "prepared_or_opened",
          occurredAt: new Date(startsAt)
        },
        location: "refrigerator",
        rules: [rule]
      });
      const atBoundary = calculateStorageDeadline({
        clock: new Date(deadlineAt),
        startEvent: {
          kind: "prepared_or_opened",
          occurredAt: new Date(startsAt)
        },
        location: "refrigerator",
        rules: [rule]
      });

      expect(beforeBoundary).toEqual(
        expect.objectContaining({
          status: "ready",
          storageStatus: "use_today",
          deadlineAt
        })
      );
      expect(atBoundary).toEqual(
        expect.objectContaining({
          status: "ready",
          storageStatus: "expired",
          deadlineAt
        })
      );
    }
  );
});
