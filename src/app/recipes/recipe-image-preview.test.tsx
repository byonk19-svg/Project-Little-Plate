import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RecipeImagePreview } from "./recipe-image-preview";

describe("RecipeImagePreview", () => {
  it("keeps the review choice usable when the preview image fails", () => {
    render(
      <RecipeImagePreview
        alt=""
        fallbackLabel="Image preview unavailable"
        fallbackMessage="The image preview is unavailable, but you can still choose whether to use it."
        src="https://example.com/missing.jpg"
      />
    );

    fireEvent.error(document.querySelector("img")!);

    expect(document.querySelector("img")).not.toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Image preview unavailable" })
    ).toHaveTextContent(
      "The image preview is unavailable, but you can still choose whether to use it."
    );
  });
});
