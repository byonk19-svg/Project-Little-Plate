"use client";

import { useActionState } from "react";

import { savePersonalRecipe } from "@/modules/recipes/actions";
import {
  initialRecipeFormState,
  type RecipeFormState
} from "@/modules/recipes/form-state";
import type { PersonalRecipe } from "@/modules/recipes/queries";

type RecipeFormProps = {
  recipe?: PersonalRecipe;
  sourceUrl?: string;
  extractionMethod?: PersonalRecipe["extractionMethod"];
  title?: string;
  ingredients?: string;
  instructions?: string;
  notes?: string;
  sourceType?: PersonalRecipe["sourceType"];
  idempotencyKey?: string;
};

export function RecipeForm({
  recipe,
  sourceUrl = recipe?.sourceUrl ?? "",
  extractionMethod = recipe?.extractionMethod ?? "manual",
  title = recipe?.title ?? "",
  ingredients = recipe?.ingredients ?? "",
  instructions = recipe?.instructions ?? "",
  notes = recipe?.notes ?? "",
  sourceType = recipe?.sourceType ?? "manual",
  idempotencyKey
}: RecipeFormProps) {
  const [state, formAction, pending] = useActionState<
    RecipeFormState,
    FormData
  >(savePersonalRecipe, initialRecipeFormState);

  return (
    <form action={formAction} className="recipe-form">
      {recipe ? (
        <input name="recipeId" type="hidden" value={recipe.id} />
      ) : null}
      {!recipe && idempotencyKey ? (
        <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      ) : null}
      <input name="sourceType" type="hidden" value={sourceType} />
      <input name="extractionMethod" type="hidden" value={extractionMethod} />
      <label className="field">
        Food or recipe name
        <input defaultValue={title} name="title" required />
      </label>
      <label className="field">
        Ingredients or food description
        <textarea
          defaultValue={ingredients}
          name="ingredients"
          required
          rows={6}
        />
      </label>
      <label className="field">
        Instructions or preparation notes
        <textarea
          defaultValue={instructions}
          name="instructions"
          required
          rows={8}
        />
      </label>
      <label className="field">
        Your notes (optional)
        <textarea defaultValue={notes} name="notes" rows={4} />
      </label>
      <label className="field">
        Source URL (optional)
        <input
          defaultValue={sourceUrl}
          name="sourceUrl"
          placeholder="https://..."
          type="url"
        />
      </label>
      <p className="form-help">
        Personal recipes are private to your household and are not reviewed by
        Little Plate. Review them yourself before serving.
      </p>
      <button className="primary-action" disabled={pending} type="submit">
        {pending ? "Saving recipe…" : recipe ? "Save recipe" : "Save recipe"}
      </button>
      {state.status === "error" ? (
        <p className="form-message form-message--error" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
