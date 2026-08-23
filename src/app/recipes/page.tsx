import type { Metadata } from "next";
import Link from "next/link";

import { toggleRecipeFavorite } from "@/modules/recipes/actions";
import { recipeActionErrorMessage } from "@/modules/recipes/action-feedback";
import {
  getRecipes,
  recipeSourceLabel,
  type Recipe
} from "@/modules/recipes/queries";

import { RecipeCardImage } from "./recipe-card-image";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Recipes"
};

type RecipesPageProps = {
  searchParams: Promise<{
    q?: string;
    favorite?: string;
    tag?: string;
    deleted?: string;
    imported?: string;
    favoriteChanged?: string;
    actionError?: string;
  }>;
};

function RecipeCard({
  recipe,
  returnPath
}: {
  recipe: Recipe;
  returnPath: string;
}) {
  return (
    <article className="recipe-card">
      {recipe.image ? (
        <RecipeCardImage src={recipe.image.src} alt={recipe.image.altText} />
      ) : null}
      <div className="recipe-card__body">
        <p className="foundation-card__status">
          {recipeSourceLabel(recipe)}
          {recipe.isFavorite ? " · Favorite" : ""}
        </p>
        <h2>
          <Link href={`/recipes/${recipe.id}`}>{recipe.title}</Link>
        </h2>
        <p>{recipe.description ?? recipe.ingredients.split("\n")[0]}</p>
        {recipe.tags.length > 0 ? (
          <ul className="tag-list" aria-label="Recipe tags">
            {recipe.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="recipe-card__actions">
        <form action={toggleRecipeFavorite.bind(null, recipe.id, returnPath)}>
          <button className="secondary-action" type="submit">
            {recipe.isFavorite ? "Unfavorite" : "Favorite"}
          </button>
        </form>
        <Link className="secondary-action" href={`/recipes/${recipe.id}/edit`}>
          Edit
        </Link>
      </div>
    </article>
  );
}

export default async function RecipesPage({ searchParams }: RecipesPageProps) {
  const params = await searchParams;
  const result = await getRecipes({
    query: params.q,
    favoriteOnly: params.favorite === "1",
    tag: params.tag
  });
  const hasActiveFilters = Boolean(
    params.q?.trim() || params.favorite === "1" || params.tag
  );
  const listQuery = new URLSearchParams();
  if (params.q) listQuery.set("q", params.q);
  if (params.favorite === "1") listQuery.set("favorite", "1");
  if (params.tag) listQuery.set("tag", params.tag);
  const returnPath = `/recipes${listQuery.size ? `?${listQuery}` : ""}`;

  return (
    <div className="recipes-page">
      <header className="destination-page__header">
        <div>
          <p className="destination-page__eyebrow">Your recipe box</p>
          <h1>Recipes</h1>
          <p className="destination-page__lede">
            Keep recipes you enter or save from other websites in one private
            place.
          </p>
        </div>
        <div className="page-actions">
          <Link
            className="primary-action primary-action--link"
            href="/recipes/new"
          >
            Add recipe
          </Link>
          <Link className="secondary-action" href="/recipes/import">
            Import from a website
          </Link>
        </div>
      </header>

      {params.deleted === "1" ? (
        <p className="form-message form-message--success" role="status">
          Recipe deleted.
        </p>
      ) : null}
      {params.imported ? (
        <p className="form-message form-message--success" role="status">
          {params.imported} imported recipe
          {params.imported === "1" ? "" : "s"} saved.
        </p>
      ) : null}
      {params.favoriteChanged === "1" ? (
        <p className="form-message form-message--success" role="status">
          Favorite updated.
        </p>
      ) : null}
      {params.actionError ? (
        <p className="form-message form-message--error" role="alert">
          {recipeActionErrorMessage(params.actionError)}
        </p>
      ) : null}

      {result.status === "signed_out" ? (
        <section className="foundation-card">
          <h2>Sign in to see your recipes</h2>
          <Link className="primary-action primary-action--link" href="/login">
            Sign in
          </Link>
        </section>
      ) : result.status === "unavailable" ? (
        <section className="foundation-card">
          <p className="foundation-card__status">Recipes unavailable</p>
          <h2>Your recipe box could not be loaded</h2>
          <p>Refresh and try again.</p>
        </section>
      ) : (
        <>
          <form className="recipe-filters" method="get">
            <label className="field">
              <span>Search title, ingredient, or tag</span>
              <input defaultValue={params.q} name="q" type="search" />
            </label>
            <label className="choice">
              <input
                defaultChecked={params.favorite === "1"}
                name="favorite"
                type="checkbox"
                value="1"
              />
              <span>Favorites only</span>
            </label>
            <label className="field">
              <span>Tag</span>
              <select defaultValue={params.tag ?? ""} name="tag">
                <option value="">All tags</option>
                {result.tags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary-action" type="submit">
              Filter
            </button>
          </form>

          {result.recipes.length === 0 ? (
            hasActiveFilters ? (
              <section className="foundation-card">
                <p className="foundation-card__status">No matches</p>
                <h2>No matching recipes</h2>
                <p>Try a different search or clear the filters.</p>
                <Link className="secondary-action" href="/recipes">
                  Clear filters
                </Link>
              </section>
            ) : (
              <section className="foundation-card">
                <p className="foundation-card__status">No recipes yet</p>
                <h2>Start with one you already make</h2>
                <p>
                  Add it yourself or paste a recipe website link and check the
                  imported details before saving.
                </p>
                <Link
                  className="primary-action primary-action--link"
                  href="/recipes/new"
                >
                  Add your first recipe
                </Link>
              </section>
            )
          ) : (
            <div className="recipe-list">
              {result.recipes.map((recipe) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  returnPath={returnPath}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
