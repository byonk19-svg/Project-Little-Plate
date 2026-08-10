"use client";

import { useActionState } from "react";

import { initialRecipeImportState } from "@/modules/recipes/form-state";
import { importRecipeFromUrl } from "@/modules/recipes/import-server-action";

import { RecipeForm } from "./recipe-form";

export function RecipeImportForm() {
  const [state, formAction, pending] = useActionState(
    importRecipeFromUrl,
    initialRecipeImportState
  );

  return (
    <>
      <form action={formAction} className="recipe-import-form">
        <label className="field">
          Public recipe URL
          <input
            name="sourceUrl"
            placeholder="https://example.com/recipe"
            required
            type="url"
          />
        </label>
        <p className="form-help">
          Little Plate reads public HTTPS recipe pages only. It does not send
          login credentials or cookies.
        </p>
        <button className="primary-action" disabled={pending} type="submit">
          {pending ? "Reading recipe…" : "Extract recipe"}
        </button>
        {state.status === "error" ? (
          <p className="form-message form-message--error" role="alert">
            {state.message}
          </p>
        ) : null}
      </form>

      {state.status === "ready" || state.status === "incomplete" ? (
        <section
          className="foundation-card"
          aria-labelledby="review-import-title"
        >
          <p className="foundation-card__status">Review before saving</p>
          <h2 id="review-import-title">Check the extracted details</h2>
          {state.status === "incomplete" ? (
            <p role="status">
              Some fields were not found. Complete them below before saving.
            </p>
          ) : null}
          <RecipeForm
            extractionMethod={state.extractionMethod}
            idempotencyKey={state.idempotencyKey}
            ingredients={state.ingredients}
            instructions={state.instructions}
            notes={state.notes}
            sourceType="recipe_url"
            sourceUrl={state.sourceUrl}
            title={state.title}
          />
        </section>
      ) : null}
    </>
  );
}
