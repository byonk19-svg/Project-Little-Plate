import { describe, expect, it } from "vitest";

import {
  normalizeRecipeImportUrl,
  parseRecipePage,
  type AddressResolver
} from "@/modules/recipe-import/parser";

const resolver: AddressResolver = async () => ["93.184.216.34"];

describe("recipe import parser", () => {
  it("extracts a recipe from JSON-LD graph data", () => {
    const html = `
      <html><head><title>Example</title></head><body>
        <script type="application/ld+json">
          {"@context":"https://schema.org","@graph":[
            {"@type":"WebSite","name":"Example"},
            {"@type":"Recipe","name":"Tomato Pasta","description":"Fast dinner",
             "recipeIngredient":["2 tomatoes","200g pasta"],
             "recipeInstructions":[{"@type":"HowToStep","text":"Boil pasta."},{"@type":"HowToStep","text":"Stir together."}],
             "prepTime":"PT10M","cookTime":"PT20M","recipeYield":"4 servings",
             "recipeCategory":"Dinner","keywords":"quick, family",
             "image":"https://example.com/tomato.jpg"}
          ]}
        </script>
      </body></html>`;

    expect(parseRecipePage(html, "https://example.com/recipes/tomato")).toEqual(
      {
        ok: true,
        draft: {
          title: "Tomato Pasta",
          description: "Fast dinner",
          ingredients: "2 tomatoes\n200g pasta",
          instructions: "Boil pasta.\nStir together.",
          prepMinutes: "10",
          cookMinutes: "20",
          servings: "4",
          sourceUrl: "https://example.com/recipes/tomato",
          sourceTitle: "example.com",
          tags: "dinner, quick, family",
          suggestedImageUrl: "https://example.com/tomato.jpg"
        }
      }
    );
  });

  it("returns a typed failure for malformed or missing recipe metadata", () => {
    expect(
      parseRecipePage(
        "<html><body>Not a recipe</body></html>",
        "https://example.com"
      )
    ).toEqual({
      ok: false,
      reason: "recipe_data_not_found"
    });
    expect(
      parseRecipePage(
        '<script type="application/ld+json">{bad</script>',
        "https://example.com"
      )
    ).toEqual({
      ok: false,
      reason: "recipe_data_not_found"
    });
  });

  it("extracts multiple recipe sections from an article page", () => {
    const html = `
      <article>
        <h3>Spinach ricotta bites</h3>
        <p>A portable savory bite.</p>
        <p>You’ll need:</p>
        <ul><li>2 eggs</li><li>1 cup ricotta</li></ul>
        <p>Steps:</p>
        <ol><li>Mix everything.</li><li>Bake until set.</li></ol>
        <h3>Baby guacamole</h3>
        <p>A simple dip.</p>
        <p>You&apos;ll need:</p>
        <ul><li>1 avocado</li><li>1 tsp lemon juice</li></ul>
        <p>Steps:</p>
        <ol><li>Combine the ingredients.</li><li>Serve.</li></ol>
      </article>`;

    expect(parseRecipePage(html, "https://example.com/article")).toEqual({
      ok: true,
      drafts: [
        expect.objectContaining({
          title: "Spinach ricotta bites",
          description: "A portable savory bite.",
          ingredients: "2 eggs\n1 cup ricotta",
          instructions: "Mix everything.\nBake until set."
        }),
        expect.objectContaining({
          title: "Baby guacamole",
          description: "A simple dip.",
          ingredients: "1 avocado\n1 tsp lemon juice",
          instructions: "Combine the ingredients.\nServe."
        })
      ]
    });
  });

  it("rejects unsafe URLs and private destinations before fetching", async () => {
    await expect(
      normalizeRecipeImportUrl("javascript:alert(1)", resolver)
    ).rejects.toThrow(/http/i);
    await expect(
      normalizeRecipeImportUrl("http://localhost/recipe", resolver)
    ).rejects.toThrow(/private/i);
    await expect(
      normalizeRecipeImportUrl("http://127.0.0.1/recipe", resolver)
    ).rejects.toThrow(/private/i);
    await expect(
      normalizeRecipeImportUrl("http://example.com/recipe", resolver)
    ).resolves.toBe("http://example.com/recipe");
  });

  it("rejects a hostname when DNS resolves to a private address", async () => {
    const privateResolver: AddressResolver = async () => ["10.0.0.5"];
    await expect(
      normalizeRecipeImportUrl("https://example.com/recipe", privateResolver)
    ).rejects.toThrow(/private/i);
  });
});
