import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RecipeDetailImage } from "./recipe-detail-image";

describe("RecipeDetailImage", () => {
  it("replaces a broken image with a recoverable status", () => {
    render(
      <RecipeDetailImage src="https://example.com/missing.jpg" alt="Pasta" />
    );

    fireEvent.error(screen.getByRole("img", { name: "Pasta" }));

    expect(
      screen.queryByRole("img", { name: "Pasta" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("status", {
        name: "Recipe image unavailable"
      })
    ).toHaveTextContent(
      "This image could not be displayed. You can replace it below."
    );
  });
});
