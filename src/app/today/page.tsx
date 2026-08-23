import type { Metadata } from "next";
import Link from "next/link";

import { getNextPlannedRecipe } from "@/modules/meals/recipe-week";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Today" };

function formatLocalDate(localDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${localDate}T00:00:00Z`));
}

function ReadyRecipe({
  slot
}: {
  slot: NonNullable<Awaited<ReturnType<typeof getNextPlannedRecipe>>["slot"]>;
}) {
  return (
    <section className="today-meal foundation-card">
      <p className="foundation-card__status">
        {formatLocalDate(slot.localDate)} · {slot.mealSlot}
      </p>
      <h2>{slot.recipe.title}</h2>
      {slot.recipe.description ? <p>{slot.recipe.description}</p> : null}
      <div className="page-actions">
        <Link
          className="primary-action primary-action--link"
          href={`/recipes/${slot.recipe.id}`}
        >
          Open recipe
        </Link>
        <Link className="secondary-action" href="/week">
          Edit Week
        </Link>
      </div>
      {slot.recipe.sourceUrl ? (
        <p className="recipe-source">
          Source:{" "}
          <a href={slot.recipe.sourceUrl} rel="noreferrer" target="_blank">
            {slot.recipe.sourceTitle ?? slot.recipe.sourceUrl}
          </a>
        </p>
      ) : null}
    </section>
  );
}

export default async function TodayPage() {
  const result = await getNextPlannedRecipe();

  return (
    <div className="today-page">
      <header>
        <p className="destination-page__eyebrow">Next planned recipe</p>
        <h1>Today</h1>
        <p className="destination-page__lede">
          A calm shortcut to the next recipe you chose in Week.
        </p>
      </header>

      {result.status === "signed_out" ? (
        <section className="foundation-card">
          <h2>Sign in to see today&apos;s plan</h2>
          <Link className="primary-action primary-action--link" href="/login">
            Sign in
          </Link>
        </section>
      ) : result.status === "unavailable" ? (
        <section className="foundation-card">
          <p className="foundation-card__status">Today unavailable</p>
          <h2>Your next planned recipe could not be loaded</h2>
          <p>Refresh and try again.</p>
        </section>
      ) : result.status === "empty" ? (
        <section className="foundation-card">
          <p className="foundation-card__status">Nothing planned yet</p>
          <h2>Choose a recipe for your next meal</h2>
          <p>Today only shows recipes you place in Week yourself.</p>
          <div className="page-actions">
            <Link className="primary-action primary-action--link" href="/week">
              Open Week
            </Link>
            <Link className="secondary-action" href="/recipes">
              Browse Recipes
            </Link>
          </div>
        </section>
      ) : result.status === "ready" ? (
        <ReadyRecipe slot={result.slot} />
      ) : null}
    </div>
  );
}
