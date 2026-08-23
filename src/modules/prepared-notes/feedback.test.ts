import { describe, expect, it } from "vitest";

import { preparedNoteErrorMessage } from "./feedback";

describe("prepared note feedback", () => {
  it("maps known action errors to useful messages", () => {
    expect(preparedNoteErrorMessage("archive")).toBe(
      "That kitchen note could not be archived. Refresh and try again."
    );
    expect(preparedNoteErrorMessage("save")).toBe(
      "That kitchen note could not be saved."
    );
  });

  it("falls back safely for unknown errors", () => {
    expect(preparedNoteErrorMessage("unexpected")).toBe(
      "That kitchen note could not be saved."
    );
    expect(preparedNoteErrorMessage(undefined)).toBeNull();
  });
});
