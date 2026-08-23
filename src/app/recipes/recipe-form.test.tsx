import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RecipeForm } from "./recipe-form";

describe("RecipeForm validation recovery", () => {
  it("associates field errors and focuses the first invalid field", async () => {
    const action = async () => ({
      status: "error" as const,
      message: "Check the highlighted recipe fields.",
      fieldErrors: {
        title: "Add a title.",
        ingredients: "Add ingredients."
      }
    });

    render(
      <RecipeForm action={action} submitLabel="Save recipe" defaults={{}} />
    );

    const form = screen
      .getByRole("button", { name: "Save recipe" })
      .closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Title" })).toHaveAttribute(
        "aria-invalid",
        "true"
      );
    });
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveAttribute(
      "aria-describedby",
      "title-error"
    );
    expect(screen.getByRole("alert", { name: "Title error" })).toHaveAttribute(
      "id",
      "title-error"
    );
    expect(
      screen.getByRole("textbox", { name: "Ingredients" })
    ).toHaveAttribute("aria-describedby", "ingredients-error");
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
    });
  });
});
