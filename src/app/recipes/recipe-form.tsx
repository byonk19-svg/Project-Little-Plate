"use client";

import { useActionState, useState } from "react";

import { savePersonalRecipe } from "@/modules/recipes/actions";
import {
  initialRecipeFormState,
  type RecipeFormDraft,
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
  const initialDraft: RecipeFormDraft = {
    title,
    ingredients,
    instructions,
    notes,
    sourceUrl,
    sourceType,
    extractionMethod
  };
  const [draft, setDraft] = useState<RecipeFormDraft>(initialDraft);
  const [hasEditedAfterError, setHasEditedAfterError] = useState(false);
  const [state, formAction, pending] = useActionState<
    RecipeFormState,
    FormData
  >(savePersonalRecipe, initialRecipeFormState);

  const visibleDraft =
    state.status === "error" && state.draft && !hasEditedAfterError
      ? state.draft
      : draft;

  function updateDraft(next: Partial<RecipeFormDraft>) {
    setHasEditedAfterError(true);
    setDraft((current) => ({ ...current, ...next }));
  }

  return (
    <form
      action={(formData) => {
        setHasEditedAfterError(false);
        return formAction(formData);
      }}
      className="recipe-form"
    >
      {recipe ? (
        <input name="recipeId" type="hidden" value={recipe.id} />
      ) : null}
      {!recipe && idempotencyKey ? (
        <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      ) : null}
      <input name="sourceType" type="hidden" value={visibleDraft.sourceType} />
      <input
        name="extractionMethod"
        type="hidden"
        value={visibleDraft.extractionMethod}
      />
      <label className="field">
        Food or recipe name
        <input
          name="title"
          onChange={(event) => updateDraft({ title: event.target.value })}
          required
          value={visibleDraft.title}
        />
      </label>
      <label className="field">
        Ingredients or food description
        <textarea
          name="ingredients"
          onChange={(event) => updateDraft({ ingredients: event.target.value })}
          required
          rows={6}
          value={visibleDraft.ingredients}
        />
      </label>
      <label className="field">
        Instructions or preparation notes
        <textarea
          name="instructions"
          onChange={(event) =>
            updateDraft({ instructions: event.target.value })
          }
          required
          rows={8}
          value={visibleDraft.instructions}
        />
      </label>
      <label className="field">
        Your notes (optional)
        <textarea
          name="notes"
          onChange={(event) => updateDraft({ notes: event.target.value })}
          rows={4}
          value={visibleDraft.notes}
        />
      </label>
      <label className="field">
        Source URL (optional)
        <input
          name="sourceUrl"
          onChange={(event) =>
            updateDraft({
              sourceUrl: event.target.value,
              sourceType: event.target.value.trim() ? "recipe_url" : "manual"
            })
          }
          placeholder="https://..."
          type="url"
          value={visibleDraft.sourceUrl}
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
