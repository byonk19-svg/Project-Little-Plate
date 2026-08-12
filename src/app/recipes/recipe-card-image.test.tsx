import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RecipeCardImage } from "./recipe-card-image";

describe("RecipeCardImage", () => {
  it("removes a broken image so the recipe card can fall back to text", () => {
    render(
      <RecipeCardImage src="https://example.com/missing.jpg" alt="Pasta" />
    );

    fireEvent.error(screen.getByRole("img", { name: "Pasta" }));

    expect(
      screen.queryByRole("img", { name: "Pasta" })
    ).not.toBeInTheDocument();
  });
});
