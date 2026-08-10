import type { PersonalRecipeDraft } from "@/modules/recipes/domain";

export type RecipeFormDraft = PersonalRecipeDraft;

export type RecipeFormState = {
  status: "idle" | "error";
  message: string;
  draft?: RecipeFormDraft;
};

export const initialRecipeFormState: RecipeFormState = {
  status: "idle",
  message: ""
};

export type RecipeImportState =
  | { status: "idle" | "error"; message: string }
  | {
      status: "ready" | "incomplete";
      message: string;
      idempotencyKey: string;
      sourceUrl: string;
      title: string;
      ingredients: string;
      instructions: string;
      notes: string;
      extractionMethod: "json_ld" | "itemprop" | "metadata_preview";
      missing: string[];
    };

export const initialRecipeImportState: RecipeImportState = {
  status: "idle",
  message: ""
};

export type PersonalPlanningFormState = {
  status: "idle" | "error";
  message: string;
};

export const initialPersonalPlanningFormState: PersonalPlanningFormState = {
  status: "idle",
  message: ""
};
