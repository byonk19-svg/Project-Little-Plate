import type { Metadata } from "next";
import Link from "next/link";

import { RecipeForm } from "@/app/recipes/recipe-form";

export const metadata: Metadata = { title: "Add a recipe" };

export default function NewRecipePage() {
  return (
    <article className="recipe-editor-page">
      <header>
        <Link className="catalog-back-link" href="/recipes">
          ← Recipes
        </Link>
        <p className="destination-page__eyebrow">Household library</p>
        <h1>Add a food or recipe</h1>
        <p className="destination-page__lede">
          Save a food or recipe you want to consider for the week.
        </p>
      </header>
      <RecipeForm idempotencyKey={crypto.randomUUID()} />
    </article>
  );
}
