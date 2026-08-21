"use client";

import { useActionState } from "react";

import { RecipeImagePreview } from "@/app/recipes/recipe-image-preview";
import {
  initialRecipeFormState,
  type RecipeFormState
} from "@/modules/recipes/form-state";
import type { RecipeImportMatch } from "@/modules/recipe-import/duplicates";

export type RecipeFormDefaults = {
  title?: string;
  description?: string | null;
  ingredients?: string;
  instructions?: string;
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  servings?: number | null;
  notes?: string | null;
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  tags?: string[];
  isFavorite?: boolean;
  suggestedImageUrl?: string | null;
  existingMatches?: RecipeImportMatch[];
};

type RecipeAction = (
  previousState: RecipeFormState,
  formData: FormData
) => Promise<RecipeFormState>;

type RecipeFormProps = {
  action: RecipeAction;
  defaults?: RecipeFormDefaults;
  submitLabel: string;
};

function FieldError({ message }: { message?: string }) {
  return message ? (
    <small className="field-error" role="alert">
      {message}
    </small>
  ) : null;
}

export function RecipeForm({ action, defaults, submitLabel }: RecipeFormProps) {
  const [state, formAction, isPending] = useActionState(
    action,
    initialRecipeFormState
  );
  const errors = state.fieldErrors ?? {};
  const existingMatches = defaults?.existingMatches ?? [];

  return (
    <form action={formAction} className="recipe-form">
      <label className="field">
        <span>Title</span>
        <input
          autoComplete="off"
          defaultValue={defaults?.title}
          maxLength={160}
          name="title"
          required
          type="text"
        />
        <FieldError message={errors.title} />
      </label>

      <label className="field">
        <span>Short description (optional)</span>
        <textarea
          defaultValue={defaults?.description ?? ""}
          maxLength={2000}
          name="description"
          rows={3}
        />
        <FieldError message={errors.description} />
      </label>

      <label className="field">
        <span>Ingredients</span>
        <textarea
          defaultValue={defaults?.ingredients}
          maxLength={12000}
          name="ingredients"
          required
          rows={8}
        />
        <small>One ingredient per line works well.</small>
        <FieldError message={errors.ingredients} />
      </label>

      <label className="field">
        <span>Instructions</span>
        <textarea
          defaultValue={defaults?.instructions}
          maxLength={20000}
          name="instructions"
          required
          rows={10}
        />
        <FieldError message={errors.instructions} />
      </label>

      <div className="recipe-form__compact-fields">
        <label className="field">
          <span>Prep minutes (optional)</span>
          <input
            defaultValue={defaults?.prepMinutes ?? ""}
            inputMode="numeric"
            min="0"
            name="prepMinutes"
            type="number"
          />
          <FieldError message={errors.prepMinutes} />
        </label>
        <label className="field">
          <span>Cook minutes (optional)</span>
          <input
            defaultValue={defaults?.cookMinutes ?? ""}
            inputMode="numeric"
            min="0"
            name="cookMinutes"
            type="number"
          />
          <FieldError message={errors.cookMinutes} />
        </label>
        <label className="field">
          <span>Servings (optional)</span>
          <input
            defaultValue={defaults?.servings ?? ""}
            inputMode="numeric"
            min="1"
            name="servings"
            type="number"
          />
          <FieldError message={errors.servings} />
        </label>
      </div>

      <label className="field">
        <span>Personal notes (optional)</span>
        <textarea
          defaultValue={defaults?.notes ?? ""}
          maxLength={4000}
          name="notes"
          rows={4}
        />
        <FieldError message={errors.notes} />
      </label>

      <fieldset>
        <legend>Source</legend>
        <label className="field">
          <span>Recipe link (optional)</span>
          <input
            defaultValue={defaults?.sourceUrl ?? ""}
            name="sourceUrl"
            placeholder="https://"
            type="url"
          />
          <FieldError message={errors.sourceUrl} />
        </label>
        <label className="field">
          <span>Source name (optional)</span>
          <input
            defaultValue={defaults?.sourceTitle ?? ""}
            maxLength={240}
            name="sourceTitle"
            type="text"
          />
          <FieldError message={errors.sourceTitle} />
        </label>
      </fieldset>

      {existingMatches.length > 0 ? (
        <section className="import-duplicate-notice" role="status">
          <p className="foundation-card__status">Already saved</p>
          <p>
            This source is already in your recipe box. Existing recipes will not
            be overwritten.
          </p>
          <ul>
            {existingMatches.map((match) => (
              <li key={match.id}>
                <a href={`/recipes/${match.id}`}>Open {match.title}</a>
              </li>
            ))}
          </ul>
          <label className="choice">
            <input name="allowDuplicate" type="checkbox" />
            <span>Import as a separate copy</span>
          </label>
        </section>
      ) : null}

      {defaults?.suggestedImageUrl ? (
        <fieldset className="recipe-image-suggestion">
          <legend>Image suggestion</legend>
          <RecipeImagePreview
            alt=""
            fallbackLabel="Image preview unavailable"
            fallbackMessage="The image preview is unavailable, but you can still choose whether to use it."
            src={defaults.suggestedImageUrl}
          />
          <p>
            The source page suggested this image. It will only be saved if you
            confirm it.
          </p>
          <label className="field">
            <span>Image description</span>
            <input
              defaultValue={defaults.title ?? "Recipe image"}
              maxLength={240}
              name="suggestedImageAlt"
              required
              type="text"
            />
          </label>
          <label className="choice">
            <input name="useSuggestedImage" type="checkbox" />
            <span>Use this image</span>
          </label>
          <input
            name="suggestedImageUrl"
            type="hidden"
            value={defaults.suggestedImageUrl}
          />
        </fieldset>
      ) : null}

      {defaults?.existingMatches ? (
        <input
          name="knownDuplicate"
          type="hidden"
          value={existingMatches.length > 0 ? "1" : "0"}
        />
      ) : null}

      <label className="field">
        <span>Tags (optional)</span>
        <input
          defaultValue={defaults?.tags?.join(", ")}
          name="tags"
          placeholder="quick, family"
          type="text"
        />
        <small>Separate simple tags with commas.</small>
        <FieldError message={errors.tags} />
      </label>

      <label className="choice">
        <input
          defaultChecked={defaults?.isFavorite}
          name="favorite"
          type="checkbox"
        />
        <span>Favorite this recipe</span>
      </label>

      <button className="primary-action" disabled={isPending} type="submit">
        {isPending ? "Saving…" : submitLabel}
      </button>

      {state.status === "error" ? (
        <p className="form-message form-message--error" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
