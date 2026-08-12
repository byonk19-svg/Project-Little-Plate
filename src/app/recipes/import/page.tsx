import type { Metadata } from "next";
import Link from "next/link";

import { ImportRecipeForm } from "@/app/recipes/import/import-form";

export const metadata: Metadata = { title: "Import recipe" };

export default function ImportRecipePage() {
  return (
    <article className="recipe-editor-page">
      <header>
        <p className="destination-page__eyebrow">Recipes</p>
        <h1>Save from a website</h1>
        <p className="destination-page__lede">
          Paste a public recipe link. You will review and edit everything before
          it is saved to your private recipe box.
        </p>
      </header>
      <ImportRecipeForm />
      <p>
        <Link href="/recipes">Back to Recipes</Link>
      </p>
    </article>
  );
}
