"use client";

import { useActionState } from "react";
import Link from "next/link";

import { RecipeForm } from "@/app/recipes/recipe-form";
import { MultiRecipeReview } from "@/app/recipes/import/multi-recipe-review";
import { createRecipe } from "@/modules/recipes/actions";
import {
  initialRecipeImportFormState,
  type RecipeImportFormState
} from "@/modules/recipe-import/form-state";
import { importRecipeFromUrl } from "@/modules/recipe-import/actions";

function importedDefaults(draft: NonNullable<RecipeImportFormState["draft"]>) {
  return {
    ...draft,
    prepMinutes: draft.prepMinutes ? Number(draft.prepMinutes) : null,
    cookMinutes: draft.cookMinutes ? Number(draft.cookMinutes) : null,
    servings: draft.servings ? Number(draft.servings) : null,
    tags: draft.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
  };
}

export function ImportRecipeForm() {
  const [state, formAction, isPending] = useActionState<
    RecipeImportFormState,
    FormData
  >(importRecipeFromUrl, initialRecipeImportFormState);

  if (state.status === "success" && state.drafts) {
    return <MultiRecipeReview drafts={state.drafts} />;
  }

  if (state.status === "success" && state.draft) {
    return (
      <div className="import-review">
        <section className="foundation-card" role="status">
          <p className="foundation-card__status">Review before saving</p>
          <h2>Imported details are editable</h2>
          <p>
            Check the title, ingredients, instructions, and source link. This
            recipe is not saved until you submit the form below.
          </p>
          {state.draft.suggestedImageUrl ? (
            <p>
              The source page suggested an image. It will not be copied or used
              unless you explicitly confirm it later.
            </p>
          ) : null}
        </section>
        <RecipeForm
          action={createRecipe}
          defaults={importedDefaults(state.draft)}
          submitLabel="Save imported recipe"
        />
        <Link href="/recipes/import">Start over</Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="recipe-import-form">
      <label className="field">
        <span>Recipe website link</span>
        <input
          autoComplete="url"
          name="url"
          placeholder="https://example.com/your-recipe"
          required
          type="url"
        />
        <small>
          We read public recipe details when available, including articles with
          multiple recipe sections. We do not bypass logins or paywalls.
        </small>
      </label>
      <button className="primary-action" disabled={isPending} type="submit">
        {isPending ? "Reading page…" : "Preview recipe"}
      </button>
      {state.status === "error" ? (
        <p className="form-message form-message--error" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
