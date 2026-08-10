import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { deletePersonalRecipeAction } from "@/modules/recipes/actions";
import { PlanningForm } from "@/app/recipes/[id]/planning-form";
import { getCurrentWeek } from "@/modules/meals/queries";
import { getPersonalRecipe } from "@/modules/recipes/queries";

type RecipeDetailPageProps = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Personal recipe" };

export default async function PersonalRecipePage({
  params
}: RecipeDetailPageProps) {
  const { id } = await params;
  const [recipeResult, week] = await Promise.all([
    getPersonalRecipe(id),
    getCurrentWeek()
  ]);
  if (recipeResult.status !== "ready") notFound();
  const recipe = recipeResult.recipe;

  return (
    <article className="recipe-detail-page">
      <header>
        <Link className="catalog-back-link" href="/recipes">
          ← Recipes
        </Link>
        <p className="foundation-card__status">
          Personal recipe — not reviewed
        </p>
        <h1>{recipe.title}</h1>
        <p className="destination-page__lede">
          This recipe is private to your household and has not been assessed by
          Little Plate.
        </p>
      </header>

      <section className="foundation-card" aria-labelledby="ingredients-title">
        <h2 id="ingredients-title">Ingredients or food description</h2>
        <p className="recipe-body">{recipe.ingredients}</p>
      </section>

      <section className="foundation-card" aria-labelledby="instructions-title">
        <h2 id="instructions-title">Instructions or preparation notes</h2>
        <p className="recipe-body">{recipe.instructions}</p>
      </section>

      {recipe.notes ? (
        <section className="foundation-card" aria-labelledby="notes-title">
          <h2 id="notes-title">Your notes</h2>
          <p className="recipe-body">{recipe.notes}</p>
        </section>
      ) : null}

      <section
        className="foundation-card"
        aria-labelledby="recipe-source-title"
      >
        <h2 id="recipe-source-title">Source</h2>
        {recipe.sourceUrl ? (
          <a href={recipe.sourceUrl} rel="noreferrer" target="_blank">
            {recipe.sourceUrl}
          </a>
        ) : (
          <p>Added directly by your household.</p>
        )}
        <p className="form-help">
          Little Plate does not verify this recipe&apos;s safety, allergens,
          storage, or developmental suitability.
        </p>
      </section>

      {week.status === "ready" ? (
        <section
          className="foundation-card"
          aria-labelledby="personal-plan-title"
        >
          <p className="foundation-card__status">Plan ahead</p>
          <h2 id="personal-plan-title">Add to this week</h2>
          <PlanningForm
            babyId={week.plan.babyId}
            days={week.plan.days}
            recipeId={recipe.id}
          />
        </section>
      ) : (
        <section className="foundation-card" role="alert">
          <h2>Weekly planning is unavailable</h2>
          <p>Complete the baby profile before placing a recipe on the week.</p>
        </section>
      )}

      <Link
        className="secondary-action secondary-action--link"
        href={`/recipes/${recipe.id}/edit`}
      >
        Edit recipe
      </Link>
      <form action={deletePersonalRecipeAction} className="recipe-delete-form">
        <input name="recipeId" type="hidden" value={recipe.id} />
        <button className="text-action" type="submit">
          Delete recipe
        </button>
      </form>
    </article>
  );
}
