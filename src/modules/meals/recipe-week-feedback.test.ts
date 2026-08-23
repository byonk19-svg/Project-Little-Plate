import { describe, expect, it } from "vitest";

import { weekActionQueryKey } from "./recipe-week-feedback";

describe("recipe Week action feedback", () => {
  it("maps successful actions to specific user-facing outcomes", () => {
    expect(weekActionQueryKey("plan", false)).toBe("planned");
    expect(weekActionQueryKey("complete", false)).toBe("completed");
    expect(weekActionQueryKey("skip", false)).toBe("skipped");
    expect(weekActionQueryKey("replan", false)).toBe("replanned");
    expect(weekActionQueryKey("remove", false)).toBe("removed");
  });

  it("uses the error outcome when persistence fails", () => {
    expect(weekActionQueryKey("plan", true)).toBe("error");
    expect(weekActionQueryKey("remove", true)).toBe("error");
  });
});
