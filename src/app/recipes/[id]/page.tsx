import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { deleteRecipe, toggleRecipeFavorite } from "@/modules/recipes/actions";
import { getRecipe, recipeSourceLabel } from "@/modules/recipes/queries";
import { getRecipeImage } from "@/modules/recipe-images/queries";

import { RecipeImagePanel } from "./recipe-image-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Recipe" };

function RecipeText({ value }: { value: string }) {
  return <p className="recipe-text">{value}</p>;
}

export default async function RecipeDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; updated?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const [recipe, image] = await Promise.all([
    getRecipe(id),
    getRecipeImage(id)
  ]);
  if (!recipe) notFound();

  return (
    <article className="recipe-detail-page">
      {query.created === "1" || query.updated === "1" ? (
        <p className="form-message form-message--success" role="status">
          {query.created === "1" ? "Recipe saved." : "Recipe updated."}
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
          <form action={toggleRecipeFavorite.bind(null, recipe.id)}>
            <button className="secondary-action" type="submit">
              {recipe.isFavorite ? "Unfavorite" : "Favorite"}
            </button>
          </form>
          <form action={deleteRecipe.bind(null, recipe.id)}>
            <button className="danger-action" type="submit">
              Delete
            </button>
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
