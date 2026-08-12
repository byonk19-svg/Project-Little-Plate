export type RecipeFormState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Partial<
    Record<
      | "title"
      | "description"
      | "ingredients"
      | "instructions"
      | "prepMinutes"
      | "cookMinutes"
      | "servings"
      | "notes"
      | "sourceUrl"
      | "sourceTitle"
      | "tags",
      string
    >
  >;
  recipeId?: string;
};

export const initialRecipeFormState: RecipeFormState = {
  status: "idle",
  message: ""
};
