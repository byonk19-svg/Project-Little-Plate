import { describe, expect, it } from "vitest";

import {
  normalizeExternalImageUrl,
  validateImageFile
} from "@/modules/recipe-images/domain";

describe("recipe image domain", () => {
  it("accepts an https image URL without credentials", () => {
    expect(normalizeExternalImageUrl("https://cdn.example.com/food.webp")).toBe(
      "https://cdn.example.com/food.webp"
    );
  });

  it("rejects executable and data URLs", () => {
    expect(() => normalizeExternalImageUrl("javascript:alert(1)")).toThrow(
      /http/i
    );
    expect(() =>
      normalizeExternalImageUrl("data:image/png;base64,abc")
    ).toThrow(/http/i);
  });

  it("accepts bounded raster uploads and rejects unsafe or oversized files", () => {
    expect(validateImageFile({ type: "image/webp", size: 1000 })).toEqual({
      ok: true
    });
    expect(validateImageFile({ type: "text/html", size: 1000 })).toEqual({
      ok: false,
      message: "Use a JPG, PNG, or WebP image."
    });
    expect(validateImageFile({ type: "image/png", size: 6_000_000 })).toEqual({
      ok: false,
      message: "Images must be 5 MB or smaller."
    });
  });
});
