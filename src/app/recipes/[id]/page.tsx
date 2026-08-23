import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import {
  recipeActionErrorMessage,
  recipeFavoriteMessage
} from "@/modules/recipes/action-feedback";
import { deleteRecipe, toggleRecipeFavorite } from "@/modules/recipes/actions";
import {
  getRecipePageResult,
  recipeSourceLabel
} from "@/modules/recipes/queries";
import { getRecipeImage } from "@/modules/recipe-images/queries";

import { RecipeImagePanel } from "./recipe-image-panel";
import { RecipePageUnavailable } from "../recipe-page-state";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Recipe" };

const imageErrorMessages: Record<string, string> = {
  alt: "Add a short description for the cover image.",
  file: "Choose a valid JPG, PNG, or WebP image under 5 MB.",
  save: "The cover image could not be saved. Try again.",
  setup: "The cover image could not be saved until account setup is complete.",
  upload: "The cover image upload failed. Try again.",
  url: "Enter a valid public HTTPS image URL."
};

function RecipeText({ value }: { value: string }) {
  return <p className="recipe-text">{value}</p>;
}

export default async function RecipeDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    created?: string;
    updated?: string;
    imageError?: string;
    imageSaved?: string;
    favorite?: string;
    actionError?: string;
  }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const recipeResult = await getRecipePageResult(id);
  if (recipeResult.status !== "ready") {
    if (recipeResult.status === "signed_out") redirect("/login");
    if (recipeResult.status === "unavailable") {
      return <RecipePageUnavailable />;
    }
    notFound();
  }
  const recipe = recipeResult.recipe;
  const image = await getRecipeImage(id);

  return (
    <article className="recipe-detail-page">
      {query.created === "1" || query.updated === "1" ? (
        <p className="form-message form-message--success" role="status">
          {query.created === "1" ? "Recipe saved." : "Recipe updated."}
        </p>
      ) : null}
      {query.imageSaved === "1" ? (
        <p className="form-message form-message--success" role="status">
          Cover image saved.
        </p>
      ) : null}
      {query.imageSaved === "deleted" ? (
        <p className="form-message form-message--success" role="status">
          Cover image removed.
        </p>
      ) : null}
      {query.imageError ? (
        <p className="form-message form-message--error" role="alert">
          {imageErrorMessages[query.imageError] ??
            "The cover image could not be updated. Try again."}
        </p>
      ) : null}
      {recipeFavoriteMessage(query.favorite) ? (
        <p className="form-message form-message--success" role="status">
          {recipeFavoriteMessage(query.favorite)}
        </p>
      ) : null}
      {query.actionError ? (
        <p className="form-message form-message--error" role="alert">
          {recipeActionErrorMessage(query.actionError)}
        </p>
      ) : null}
      <header>
        <p className="destination-page__eyebrow">{recipeSourceLabel(recipe)}</p>
        <h1>{recipe.title}</h1>
        {recipe.description ? (
          <p className="destination-page__lede">{recipe.description}</p>
        ) : null}
        <div className="page-actions">
          <Link
            className="primary-action primary-action--link"
            href={`/week?recipeId=${recipe.id}`}
          >
            Plan this recipe
          </Link>
          <Link
            className="secondary-action"
            href={`/recipes/${recipe.id}/edit`}
          >
            Edit
          </Link>
          <form
            action={toggleRecipeFavorite.bind(
              null,
              recipe.id,
              `/recipes/${recipe.id}`
            )}
          >
            <button className="secondary-action" type="submit">
              {recipe.isFavorite ? "Unfavorite" : "Favorite"}
            </button>
          </form>
          <form action={deleteRecipe.bind(null, recipe.id)}>
            <ConfirmSubmitButton
              className="danger-action"
              confirmation={`Delete “${recipe.title}”? Its Week placements and preparation notes will also be removed.`}
            >
              Delete
            </ConfirmSubmitButton>
          </form>
        </div>
      </header>

      <div className="recipe-facts">
        {recipe.prepMinutes !== null ? (
          <span>Prep: {recipe.prepMinutes} min</span>
        ) : null}
        {recipe.cookMinutes !== null ? (
          <span>Cook: {recipe.cookMinutes} min</span>
        ) : null}
        {recipe.servings !== null ? (
          <span>Serves: {recipe.servings}</span>
        ) : null}
      </div>

      <section className="recipe-detail-grid">
        <div className="foundation-card">
          <h2>Ingredients</h2>
          <RecipeText value={recipe.ingredients} />
        </div>
        <div className="foundation-card">
          <h2>Instructions</h2>
          <RecipeText value={recipe.instructions} />
        </div>
      </section>

      {recipe.notes ? (
        <section className="foundation-card">
          <h2>Personal notes</h2>
          <RecipeText value={recipe.notes} />
        </section>
      ) : null}

      {recipe.tags.length > 0 ? (
        <section aria-label="Recipe tags">
          <h2>Tags</h2>
          <ul className="tag-list">
            {recipe.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {recipe.sourceUrl ? (
        <p className="recipe-source">
          Source:{" "}
          <a href={recipe.sourceUrl} rel="noreferrer" target="_blank">
            {recipe.sourceTitle ?? recipe.sourceUrl}
          </a>
        </p>
      ) : null}

      <RecipeImagePanel
        image={image}
        recipeId={recipe.id}
        sourceUrl={recipe.sourceUrl}
      />
    </article>
  );
}
