import Link from "next/link";

export function RecipePageUnavailable() {
  return (
    <article className="foundation-card">
      <p className="foundation-card__status">Recipe unavailable</p>
      <h1>Your recipe could not be loaded</h1>
      <p>Refresh and try again, or return to your recipe box.</p>
      <Link className="secondary-action" href="/recipes">
        Back to Recipes
      </Link>
    </article>
  );
}
