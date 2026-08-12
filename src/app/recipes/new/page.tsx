import type { Metadata } from "next";
import Link from "next/link";

import { RecipeForm } from "@/app/recipes/recipe-form";
import { createRecipe } from "@/modules/recipes/actions";

export const metadata: Metadata = { title: "New recipe" };

export default function NewRecipePage() {
  return (
    <article className="recipe-editor-page">
      <header>
        <p className="destination-page__eyebrow">Recipes</p>
        <h1>Add a recipe</h1>
        <p className="destination-page__lede">
          Enter the recipe you want to keep in your private recipe box.
        </p>
      </header>
      <RecipeForm action={createRecipe} submitLabel="Save recipe" />
      <p>
        <Link href="/recipes">Back to Recipes</Link>
      </p>
    </article>
  );
}
