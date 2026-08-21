import { describe, expect, it } from "vitest";

import { classifyRecipePageState } from "./page-state";

describe("recipe page state", () => {
  it("preserves signed-out and unavailable session states", () => {
    expect(
      classifyRecipePageState({
        sessionStatus: "signed_out",
        queryError: false,
        recordFound: false
      })
    ).toBe("signed_out");
    expect(
      classifyRecipePageState({
        sessionStatus: "unavailable",
        queryError: false,
        recordFound: false
      })
    ).toBe("unavailable");
  });

  it("distinguishes a missing recipe from a loaded recipe", () => {
    expect(
      classifyRecipePageState({
        sessionStatus: "authenticated",
        queryError: false,
        recordFound: false
      })
    ).toBe("not_found");
    expect(
      classifyRecipePageState({
        sessionStatus: "authenticated",
        queryError: false,
        recordFound: true
      })
    ).toBe("ready");
  });

  it("treats a recipe query error as unavailable", () => {
    expect(
      classifyRecipePageState({
        sessionStatus: "authenticated",
        queryError: true,
        recordFound: false
      })
    ).toBe("unavailable");
  });
});
