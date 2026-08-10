import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RecipeForm } from "@/app/recipes/recipe-form";
import { getPersonalRecipe } from "@/modules/recipes/queries";

type EditRecipePageProps = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Edit recipe" };

export default async function EditRecipePage({ params }: EditRecipePageProps) {
  const { id } = await params;
  const result = await getPersonalRecipe(id);
  if (result.status !== "ready") notFound();
  return (
    <article className="recipe-editor-page">
      <header>
        <Link className="catalog-back-link" href={`/recipes/${id}`}>
          ← Recipe
        </Link>
        <p className="destination-page__eyebrow">Household library</p>
        <h1>Edit recipe</h1>
      </header>
      <RecipeForm recipe={result.recipe} />
    </article>
  );
}
