import { describe, expect, test } from "vitest";

import { formatStorageLocalDateTime } from "./presentation";

describe("formatStorageLocalDateTime", () => {
  test.each([
    {
      name: "spring transition",
      preparedAt: "2026-03-08T06:30:00.000Z",
      preparedCopy: "Mar 8, 2026, 12:30 AM",
      deadlineAt: "2026-03-09T06:30:00.000Z",
      deadlineCopy: "Mar 9, 2026, 1:30 AM"
    },
    {
      name: "fall transition",
      preparedAt: "2026-11-01T05:30:00.000Z",
      preparedCopy: "Nov 1, 2026, 12:30 AM",
      deadlineAt: "2026-11-02T05:30:00.000Z",
      deadlineCopy: "Nov 1, 2026, 11:30 PM"
    }
  ])(
    "$name displays the exact 24-hour instants in America/Chicago",
    ({ preparedAt, preparedCopy, deadlineAt, deadlineCopy }) => {
      expect(formatStorageLocalDateTime(preparedAt, "America/Chicago")).toBe(
        preparedCopy
      );
      expect(formatStorageLocalDateTime(deadlineAt, "America/Chicago")).toBe(
        deadlineCopy
      );
    }
  );
});
