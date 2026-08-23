import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PendingSubmitButton } from "./pending-submit-button";

describe("PendingSubmitButton", () => {
  it("renders its normal label inside a form", () => {
    render(
      <form>
        <PendingSubmitButton pendingLabel="Saving…">
          Save note
        </PendingSubmitButton>
      </form>
    );

    expect(screen.getByRole("button", { name: "Save note" })).toBeVisible();
  });
});
