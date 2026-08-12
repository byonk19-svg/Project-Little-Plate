import type { RecipeImportDraft } from "@/modules/recipe-import/parser";

export type RecipeImportFormState = {
  status: "idle" | "error" | "success";
  message: string;
  draft?: RecipeImportDraft;
  drafts?: RecipeImportDraft[];
};

export type RecipeImportSaveFormState = {
  status: "idle" | "error";
  message: string;
};

export const initialRecipeImportFormState: RecipeImportFormState = {
  status: "idle",
  message: ""
};
