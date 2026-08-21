"use client";

import { useActionState } from "react";

import { RecipeImagePreview } from "@/app/recipes/recipe-image-preview";
import { saveImportedRecipes } from "@/modules/recipes/actions";
import type { RecipeImportSaveFormState } from "@/modules/recipe-import/form-state";
import type { RecipeImportDraft } from "@/modules/recipe-import/parser";

const initialState: RecipeImportSaveFormState = {
  status: "idle",
  message: ""
};

function fieldName(index: number, name: string): string {
  return `recipe_${index}_${name}`;
}

function RecipeDraftFields({
  draft,
  index
}: {
  draft: RecipeImportDraft;
  index: number;
}) {
  const existingMatches = draft.existingMatches ?? [];
  const isDuplicate = existingMatches.length > 0;

  return (
    <fieldset
      className={`import-recipe-card${isDuplicate ? " import-recipe-card--duplicate" : ""}`}
    >
      <legend>
        <label className="choice">
          <input
            defaultChecked={!isDuplicate}
            name="selected"
            type="checkbox"
            value={index}
          />
          <span>
            {isDuplicate ? "Import separate copy" : "Save this recipe"}
          </span>
        </label>
      </legend>
      {isDuplicate ? (
        <div className="import-duplicate-notice" role="status">
          <p className="foundation-card__status">Already saved</p>
          <p>This source is already in your recipe box.</p>
          <ul>
            {existingMatches.map((match) => (
              <li key={match.id}>
                <a href={`/recipes/${match.id}`}>Open {match.title}</a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <label className="field">
        <span>Title</span>
        <input
          defaultValue={draft.title}
          name={fieldName(index, "title")}
          required
          type="text"
        />
      </label>
      <label className="field">
        <span>Description (optional)</span>
        <textarea
          defaultValue={draft.description}
          name={fieldName(index, "description")}
          rows={2}
        />
      </label>
      <label className="field">
        <span>Ingredients</span>
        <textarea
          defaultValue={draft.ingredients}
          name={fieldName(index, "ingredients")}
          required
          rows={6}
        />
      </label>
      <label className="field">
        <span>Instructions</span>
        <textarea
          defaultValue={draft.instructions}
          name={fieldName(index, "instructions")}
          required
          rows={7}
        />
      </label>
      <div className="recipe-form__compact-fields">
        <label className="field">
          <span>Prep minutes</span>
          <input
            defaultValue={draft.prepMinutes}
            min="0"
            name={fieldName(index, "prepMinutes")}
            type="number"
          />
        </label>
        <label className="field">
          <span>Cook minutes</span>
          <input
            defaultValue={draft.cookMinutes}
            min="0"
            name={fieldName(index, "cookMinutes")}
            type="number"
          />
        </label>
        <label className="field">
          <span>Servings</span>
          <input
            defaultValue={draft.servings}
            min="1"
            name={fieldName(index, "servings")}
            type="number"
          />
        </label>
      </div>
      <label className="field">
        <span>Tags (optional)</span>
        <input
          defaultValue={draft.tags}
          name={fieldName(index, "tags")}
          placeholder="quick, family"
          type="text"
        />
      </label>
      <input
        defaultValue={draft.sourceUrl}
        name={fieldName(index, "sourceUrl")}
        type="hidden"
      />
      <input
        defaultValue={draft.sourceTitle}
        name={fieldName(index, "sourceTitle")}
        type="hidden"
      />
      <input
        name={fieldName(index, "knownDuplicate")}
        type="hidden"
        value={isDuplicate ? "1" : "0"}
      />
      {draft.suggestedImageUrl ? (
        <fieldset className="recipe-image-suggestion">
          <legend>Image suggestion</legend>
          <RecipeImagePreview
            alt=""
            fallbackLabel="Image preview unavailable"
            fallbackMessage="The image preview is unavailable, but you can still choose whether to use it."
            src={draft.suggestedImageUrl}
          />
          <p>The source page suggested this image.</p>
          <label className="field">
            <span>Image description</span>
            <input
              defaultValue={draft.title}
              maxLength={240}
              name={fieldName(index, "suggestedImageAlt")}
              required
              type="text"
            />
          </label>
          <label className="choice">
            <input
              name={fieldName(index, "useSuggestedImage")}
              type="checkbox"
            />
            <span>Use this image</span>
          </label>
          <input
            name={fieldName(index, "suggestedImageUrl")}
            type="hidden"
            value={draft.suggestedImageUrl}
          />
        </fieldset>
      ) : null}
    </fieldset>
  );
}

export function MultiRecipeReview({ drafts }: { drafts: RecipeImportDraft[] }) {
  const [state, formAction, isPending] = useActionState(
    saveImportedRecipes,
    initialState
  );

  return (
    <form action={formAction} className="import-review import-review--multiple">
      <section className="foundation-card" role="status">
        <p className="foundation-card__status">Review before saving</p>
        <h2>Choose recipes to save</h2>
        <p>
          We found {drafts.length} recipes on this page. Edit any details you
          want, leave existing matches unchecked unless you want a separate
          copy, then save the selected recipes.
        </p>
      </section>
      {drafts.map((draft, index) => (
        <RecipeDraftFields
          draft={draft}
          index={index}
          key={`${draft.title}-${index}`}
        />
      ))}
      <button className="primary-action" disabled={isPending} type="submit">
        {isPending ? "Saving…" : "Save selected recipes"}
      </button>
      {state.status === "error" ? (
        <p className="form-message form-message--error" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
