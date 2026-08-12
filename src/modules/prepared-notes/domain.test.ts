import { describe, expect, it } from "vitest";

import { normalizePreparedNote } from "@/modules/prepared-notes/domain";

describe("prepared note domain", () => {
  it("accepts a bounded preparation note", () => {
    expect(
      normalizePreparedNote({
        status: "prepared",
        portionCount: "3",
        notes: "Made before lunch."
      })
    ).toEqual({
      ok: true,
      value: {
        status: "prepared",
        portionCount: 3,
        notes: "Made before lunch."
      }
    });
  });

  it("rejects negative and malformed portion counts", () => {
    expect(
      normalizePreparedNote({
        status: "prepared",
        portionCount: "-2",
        notes: ""
      })
    ).toEqual({ ok: false, message: "Use a whole number from 0 to 1000." });
  });
});
