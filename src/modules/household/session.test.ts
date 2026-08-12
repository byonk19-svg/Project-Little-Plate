import { describe, expect, test } from "vitest";

import { classifyHouseholdSession } from "@/modules/household/session";

describe("household session context", () => {
  test("distinguishes a signed-out session from an unavailable household profile", () => {
    expect(
      classifyHouseholdSession({
        claimsPresent: false,
        profileHouseholdId: null
      })
    ).toEqual({ status: "signed_out" });

    expect(
      classifyHouseholdSession({
        claimsPresent: true,
        profileHouseholdId: null
      })
    ).toEqual({ status: "unavailable" });
  });

  test("returns the household identity when authenticated profile data is present", () => {
    expect(
      classifyHouseholdSession({
        claimsPresent: true,
        profileHouseholdId: "household-1"
      })
    ).toEqual({ status: "authenticated", householdId: "household-1" });
  });
});
