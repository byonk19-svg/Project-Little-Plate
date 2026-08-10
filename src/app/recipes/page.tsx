import type { Metadata } from "next";
import Link from "next/link";

import { getPersonalRecipes } from "@/modules/recipes/queries";

export const metadata: Metadata = { title: "Recipes" };

export default async function RecipesPage() {
  const result = await getPersonalRecipes();

  return (
    <article className="recipes-page">
      <header>
        <p className="destination-page__eyebrow">Household library</p>
        <h1>Your recipes</h1>
        <p className="destination-page__lede">
          Save foods and recipes you want to use in this week&apos;s plan.
        </p>
      </header>

      <div className="recipes-page__actions">
        <Link
          className="primary-action primary-action--link"
          href="/recipes/new"
        >
          Add a food or recipe
        </Link>
        <Link
          className="secondary-action secondary-action--link"
          href="/recipes/import"
        >
          Paste a recipe link
        </Link>
      </div>

      {result.status === "unavailable" ? (
        <section className="foundation-card" role="alert">
          <p className="foundation-card__status">Unavailable</p>
          <h2>Recipes could not be loaded</h2>
          <p>Refresh and try again. No recipe information is guessed.</p>
        </section>
      ) : result.items.length === 0 ? (
        <section className="foundation-card">
          <p className="foundation-card__status">Empty library</p>
          <h2>Save your first food or recipe</h2>
          <p>
            Add a recipe yourself or paste a public recipe link. Saved recipes
            stay private to your household.
          </p>
        </section>
      ) : (
        <section className="recipe-list" aria-label="Personal recipes">
          {result.items.map((recipe) => (
            <Link
              className="recipe-list__item"
              href={`/recipes/${recipe.id}`}
              key={recipe.id}
            >
              <span className="foundation-card__status">
                Personal recipe — not reviewed
              </span>
              <h2>{recipe.title}</h2>
              <p>
                {recipe.sourceUrl
                  ? "Imported from a recipe link"
                  : "Added by your household"}
              </p>
            </Link>
          ))}
        </section>
      )}
    </article>
  );
}
