import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmSubmitButton } from "./confirm-submit-button";

describe("ConfirmSubmitButton", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prevents submission when the caregiver cancels", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <ConfirmSubmitButton confirmation="Delete this recipe?">
          Delete
        </ConfirmSubmitButton>
      </form>
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(window.confirm).toHaveBeenCalledWith("Delete this recipe?");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("allows submission after confirmation", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <ConfirmSubmitButton confirmation="Remove this image?">
          Remove image
        </ConfirmSubmitButton>
      </form>
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));

    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
