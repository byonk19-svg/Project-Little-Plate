import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { RecipeForm } from "@/app/recipes/recipe-form";
import { RecipePageUnavailable } from "@/app/recipes/recipe-page-state";
import { updateRecipe } from "@/modules/recipes/actions";
import { getRecipePageResult } from "@/modules/recipes/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Edit recipe" };

export default async function EditRecipePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipeResult = await getRecipePageResult(id);
  if (recipeResult.status !== "ready") {
    if (recipeResult.status === "signed_out") redirect("/login");
    if (recipeResult.status === "unavailable") {
      return <RecipePageUnavailable />;
    }
    notFound();
  }
  const recipe = recipeResult.recipe;

  return (
    <article className="recipe-editor-page">
      <header>
        <p className="destination-page__eyebrow">Recipes</p>
        <h1>Edit {recipe.title}</h1>
        <p className="destination-page__lede">
          Imported and personal recipe content stays editable.
        </p>
      </header>
      <RecipeForm
        action={updateRecipe.bind(null, recipe.id)}
        defaults={recipe}
        submitLabel="Save changes"
      />
      <p>
        <Link href={`/recipes/${recipe.id}`}>Cancel</Link>
      </p>
    </article>
  );
}
