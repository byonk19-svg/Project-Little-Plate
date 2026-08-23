"use client";

import { useActionState, useEffect, useRef } from "react";

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

const fieldLabels = {
  title: "Title",
  description: "Short description (optional)",
  ingredients: "Ingredients",
  instructions: "Instructions",
  prepMinutes: "Prep minutes (optional)",
  cookMinutes: "Cook minutes (optional)",
  servings: "Servings (optional)",
  notes: "Personal notes (optional)",
  sourceUrl: "Recipe link (optional)",
  sourceTitle: "Source name (optional)",
  tags: "Tags (optional)"
} as const;

function fieldProps(name: string, message?: string) {
  return {
    "aria-label": fieldLabels[name as keyof typeof fieldLabels],
    id: name,
    "aria-describedby": message ? `${name}-error` : undefined,
    "aria-invalid": message ? true : undefined
  };
}

function FieldError({ name, message }: { name: string; message?: string }) {
  return message ? (
    <small
      aria-label={`${fieldLabels[name as keyof typeof fieldLabels]} error`}
      className="field-error"
      id={`${name}-error`}
      role="alert"
    >
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
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status !== "error") return;
    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  }, [state.status, state.fieldErrors]);

  return (
    <form ref={formRef} action={formAction} className="recipe-form">
      <label className="field" htmlFor="title">
        <span>Title</span>
        <input
          {...fieldProps("title", errors.title)}
          autoComplete="off"
          defaultValue={defaults?.title}
          maxLength={160}
          name="title"
          required
          type="text"
        />
        <FieldError name="title" message={errors.title} />
      </label>

      <label className="field" htmlFor="description">
        <span>Short description (optional)</span>
        <textarea
          {...fieldProps("description", errors.description)}
          defaultValue={defaults?.description ?? ""}
          maxLength={2000}
          name="description"
          rows={3}
        />
        <FieldError name="description" message={errors.description} />
      </label>

      <label className="field" htmlFor="ingredients">
        <span>Ingredients</span>
        <textarea
          {...fieldProps("ingredients", errors.ingredients)}
          defaultValue={defaults?.ingredients}
          maxLength={12000}
          name="ingredients"
          required
          rows={8}
        />
        <small>One ingredient per line works well.</small>
        <FieldError name="ingredients" message={errors.ingredients} />
      </label>

      <label className="field" htmlFor="instructions">
        <span>Instructions</span>
        <textarea
          {...fieldProps("instructions", errors.instructions)}
          defaultValue={defaults?.instructions}
          maxLength={20000}
          name="instructions"
          required
          rows={10}
        />
        <FieldError name="instructions" message={errors.instructions} />
      </label>

      <div className="recipe-form__compact-fields">
        <label className="field" htmlFor="prepMinutes">
          <span>Prep minutes (optional)</span>
          <input
            {...fieldProps("prepMinutes", errors.prepMinutes)}
            defaultValue={defaults?.prepMinutes ?? ""}
            inputMode="numeric"
            min="0"
            name="prepMinutes"
            type="number"
          />
          <FieldError name="prepMinutes" message={errors.prepMinutes} />
        </label>
        <label className="field" htmlFor="cookMinutes">
          <span>Cook minutes (optional)</span>
          <input
            {...fieldProps("cookMinutes", errors.cookMinutes)}
            defaultValue={defaults?.cookMinutes ?? ""}
            inputMode="numeric"
            min="0"
            name="cookMinutes"
            type="number"
          />
          <FieldError name="cookMinutes" message={errors.cookMinutes} />
        </label>
        <label className="field" htmlFor="servings">
          <span>Servings (optional)</span>
          <input
            {...fieldProps("servings", errors.servings)}
            defaultValue={defaults?.servings ?? ""}
            inputMode="numeric"
            min="1"
            name="servings"
            type="number"
          />
          <FieldError name="servings" message={errors.servings} />
        </label>
      </div>

      <label className="field" htmlFor="notes">
        <span>Personal notes (optional)</span>
        <textarea
          {...fieldProps("notes", errors.notes)}
          defaultValue={defaults?.notes ?? ""}
          maxLength={4000}
          name="notes"
          rows={4}
        />
        <FieldError name="notes" message={errors.notes} />
      </label>

      <fieldset>
        <legend>Source</legend>
        <label className="field" htmlFor="sourceUrl">
          <span>Recipe link (optional)</span>
          <input
            {...fieldProps("sourceUrl", errors.sourceUrl)}
            defaultValue={defaults?.sourceUrl ?? ""}
            name="sourceUrl"
            placeholder="https://"
            type="url"
          />
          <FieldError name="sourceUrl" message={errors.sourceUrl} />
        </label>
        <label className="field" htmlFor="sourceTitle">
          <span>Source name (optional)</span>
          <input
            {...fieldProps("sourceTitle", errors.sourceTitle)}
            defaultValue={defaults?.sourceTitle ?? ""}
            maxLength={240}
            name="sourceTitle"
            type="text"
          />
          <FieldError name="sourceTitle" message={errors.sourceTitle} />
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

      <label className="field" htmlFor="tags">
        <span>Tags (optional)</span>
        <input
          {...fieldProps("tags", errors.tags)}
          defaultValue={defaults?.tags?.join(", ")}
          name="tags"
          placeholder="quick, family"
          type="text"
        />
        <small>Separate simple tags with commas.</small>
        <FieldError name="tags" message={errors.tags} />
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
