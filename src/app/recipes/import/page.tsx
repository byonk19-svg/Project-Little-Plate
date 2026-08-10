import type { Metadata } from "next";
import Link from "next/link";

import { RecipeImportForm } from "@/app/recipes/import-form";

export const metadata: Metadata = { title: "Import a recipe" };

export default function ImportRecipePage() {
  return (
    <article className="recipe-editor-page">
      <header>
        <Link className="catalog-back-link" href="/recipes">
          ← Recipes
        </Link>
        <p className="destination-page__eyebrow">Household library</p>
        <h1>Paste a recipe link</h1>
        <p className="destination-page__lede">
          We&apos;ll extract the details, then you&apos;ll review them before
          saving.
        </p>
      </header>
      <RecipeImportForm />
    </article>
  );
}
