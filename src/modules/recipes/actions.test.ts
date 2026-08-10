import { describe, expect, test, vi } from "vitest";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { initialRecipeFormState } from "@/modules/recipes/form-state";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn()
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { savePersonalRecipe } from "@/modules/recipes/actions";

function formData(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

describe("savePersonalRecipe", () => {
  test("returns the submitted draft when validation fails", async () => {
    const result = await savePersonalRecipe(
      initialRecipeFormState,
      formData({
        title: "Handmade oats",
        ingredients: "Oats",
        instructions: "",
        notes: "Keep this note",
        sourceUrl: "",
        sourceType: "manual",
        extractionMethod: "manual"
      })
    );

    expect(result).toMatchObject({
      status: "error",
      message: "Enter recipe instructions or preparation notes.",
      draft: {
        title: "Handmade oats",
        ingredients: "Oats",
        instructions: "",
        notes: "Keep this note",
        sourceUrl: "",
        sourceType: "manual",
        extractionMethod: "manual"
      }
    });
  });

  test("treats a source URL entered on the manual form as a linked recipe", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "simulated save failure" }
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: "user-id" } },
          error: null
        })
      },
      rpc
    } as never);

    await savePersonalRecipe(
      initialRecipeFormState,
      formData({
        title: "Handmade oats",
        ingredients: "Oats",
        instructions: "Mix together.",
        notes: "",
        sourceUrl: "https://example.com/oats",
        sourceType: "manual",
        extractionMethod: "manual",
        idempotencyKey: "00000000-0000-0000-0000-000000000001"
      })
    );

    expect(rpc).toHaveBeenCalledWith(
      "create_personal_recipe",
      expect.objectContaining({
        p_source_type: "recipe_url",
        p_source_url: "https://example.com/oats"
      })
    );
  });
});
