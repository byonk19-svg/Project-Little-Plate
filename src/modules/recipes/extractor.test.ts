import { describe, expect, test } from "vitest";

import { extractRecipeFromHtml } from "@/modules/recipes/extractor";

const jsonLdPage = `
<html><head><script type="application/ld+json">
{"@context":"https://schema.org","@type":"Recipe","name":"Banana Oats","recipeIngredient":["1 banana","1/2 cup oats"],"recipeInstructions":[{"@type":"HowToStep","text":"Mash banana."},{"@type":"HowToStep","text":"Stir in oats."}],"description":"A soft breakfast."}
</script></head><body></body></html>`;

describe("recipe extraction", () => {
  test("extracts a Recipe JSON-LD object and instructions", () => {
    expect(
      extractRecipeFromHtml(jsonLdPage, "https://example.com/recipe")
    ).toEqual({
      status: "ready",
      preview: {
        sourceUrl: "https://example.com/recipe",
        title: "Banana Oats",
        ingredients: "1 banana\n1/2 cup oats",
        instructions: "Mash banana.\nStir in oats.",
        notes: "A soft breakfast.",
        extractionMethod: "json_ld",
        missing: []
      }
    });
  });

  test("finds Recipe entries inside @graph and arrays", () => {
    const html = `<script type="application/ld+json">${JSON.stringify([
      { "@type": "WebSite", name: "Example" },
      {
        "@type": ["Recipe", "Thing"],
        name: "Toast",
        recipeIngredient: ["Bread"],
        recipeInstructions: "Toast bread."
      }
    ])}</script>`;
    expect(
      extractRecipeFromHtml(html, "https://example.com/toast")
    ).toMatchObject({
      status: "ready",
      preview: {
        title: "Toast",
        ingredients: "Bread",
        instructions: "Toast bread.",
        extractionMethod: "json_ld"
      }
    });
  });

  test("falls back to itemprop markup", () => {
    const html = `
      <h1 itemprop="name">Apple slices</h1>
      <span itemprop="recipeIngredient">Apple</span>
      <div itemprop="recipeInstructions">Cut into pieces.</div>`;
    expect(extractRecipeFromHtml(html, "https://example.com/apple")).toEqual({
      status: "ready",
      preview: {
        sourceUrl: "https://example.com/apple",
        title: "Apple slices",
        ingredients: "Apple",
        instructions: "Cut into pieces.",
        notes: "",
        extractionMethod: "itemprop",
        missing: []
      }
    });
  });

  test("returns an editable metadata preview when recipe fields are absent", () => {
    const html = `<title>Family breakfast</title><meta name="description" content="Try this at home.">`;
    expect(
      extractRecipeFromHtml(html, "https://example.com/breakfast")
    ).toEqual({
      status: "incomplete",
      preview: {
        sourceUrl: "https://example.com/breakfast",
        title: "Family breakfast",
        ingredients: "",
        instructions: "",
        notes: "Try this at home.",
        extractionMethod: "metadata_preview",
        missing: ["ingredients", "instructions"]
      }
    });
  });

  test("does not trust malformed structured data", () => {
    const html = `<script type="application/ld+json">{not-json}</script><title>Fallback</title>`;
    expect(
      extractRecipeFromHtml(html, "https://example.com/fallback")
    ).toMatchObject({
      status: "incomplete",
      preview: { title: "Fallback", extractionMethod: "metadata_preview" }
    });
  });
});
