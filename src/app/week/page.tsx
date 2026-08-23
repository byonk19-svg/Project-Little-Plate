import type { Metadata } from "next";
import Link from "next/link";

import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import {
  removeRecipeWeekSlot,
  saveRecipeWeekSlot,
  updateRecipeWeekSlotStatus
} from "@/modules/meals/recipe-week-actions";
import {
  getRecipePlanningOptions,
  getRecipeWeek
} from "@/modules/meals/recipe-week";
import type { Recipe } from "@/modules/recipes/queries";
import type { RecipeWeekActionQueryKey } from "@/modules/meals/recipe-week-feedback";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Week" };

type WeekPageProps = {
  searchParams: Promise<{
    error?: string;
    feedback?: RecipeWeekActionQueryKey;
    recipeId?: string;
    saved?: string;
    start?: string;
  }>;
};

function slotKey(localDate: string, mealSlot: string): string {
  return `${localDate}:${mealSlot}`;
}

function addLocalDays(localDate: string, amount: number): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function formatLocalDate(localDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${localDate}T00:00:00Z`));
}

const weekFeedbackMessages: Record<RecipeWeekActionQueryKey, string> = {
  planned: "Recipe planned for this slot.",
  completed: "Meal marked complete.",
  skipped: "Meal skipped.",
  replanned: "Meal marked planned again.",
  removed: "Recipe removed from this slot.",
  error: "That week change could not be saved. Refresh and try again."
};

function RecipeSlotPicker({
  localDate,
  mealSlot,
  windowStart,
  recipes,
  selectedRecipeId
}: {
  localDate: string;
  mealSlot: string;
  windowStart: string;
  recipes: Recipe[];
  selectedRecipeId?: string;
}) {
  return recipes.length === 0 ? (
    <p className="week-slot__empty">
      <Link href="/recipes/new">Add a recipe</Link> before planning this slot.
    </p>
  ) : (
    <form action={saveRecipeWeekSlot} className="week-slot-form">
      <input name="localDate" type="hidden" value={localDate} />
      <input name="mealSlot" type="hidden" value={mealSlot} />
      <input name="windowStart" type="hidden" value={windowStart} />
      <label className="field">
        <span className="sr-only">Recipe for {mealSlot}</span>
        <select defaultValue={selectedRecipeId ?? ""} name="recipeId" required>
          <option disabled value="">
            Choose a recipe
          </option>
          {recipes.map((recipe) => (
            <option key={recipe.id} value={recipe.id}>
              {recipe.title}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="sr-only">Note for {mealSlot}</span>
        <input name="note" placeholder="Meal note (optional)" type="text" />
      </label>
      <PendingSubmitButton
        className="secondary-action"
        pendingLabel="Planning…"
      >
        Plan recipe
      </PendingSubmitButton>
    </form>
  );
}

function SlotStatusActions({
  slotId,
  status,
  windowStart
}: {
  slotId: string;
  status: "planned" | "skipped" | "completed";
  windowStart: string;
}) {
  return (
    <div className="week-slot__actions">
      {status !== "completed" ? (
        <form
          action={updateRecipeWeekSlotStatus.bind(
            null,
            slotId,
            "completed",
            windowStart
          )}
        >
          <PendingSubmitButton
            className="secondary-action"
            pendingLabel="Updating…"
          >
            Mark complete
          </PendingSubmitButton>
        </form>
      ) : (
        <form
          action={updateRecipeWeekSlotStatus.bind(
            null,
            slotId,
            "planned",
            windowStart
          )}
        >
          <PendingSubmitButton
            className="secondary-action"
            pendingLabel="Updating…"
          >
            Mark planned
          </PendingSubmitButton>
        </form>
      )}
      {status === "planned" ? (
        <form
          action={updateRecipeWeekSlotStatus.bind(
            null,
            slotId,
            "skipped",
            windowStart
          )}
        >
          <PendingSubmitButton
            className="secondary-action"
            pendingLabel="Updating…"
          >
            Skip
          </PendingSubmitButton>
        </form>
      ) : null}
      <form action={removeRecipeWeekSlot.bind(null, slotId, windowStart)}>
        <ConfirmSubmitButton
          className="danger-action"
          confirmation="Remove this recipe from the Week slot? The recipe itself will stay saved."
          pendingLabel="Removing…"
        >
          Remove
        </ConfirmSubmitButton>
      </form>
    </div>
  );
}

export default async function WeekPage({ searchParams }: WeekPageProps) {
  const params = await searchParams;
  const [weekResult, recipes] = await Promise.all([
    getRecipeWeek(params.start),
    getRecipePlanningOptions()
  ]);

  const firstOpenSlotKey =
    weekResult.status === "ready" && params.recipeId
      ? weekResult.week.days
          .flatMap((day) =>
            day.slots.map(({ mealSlot, slot }) => ({
              key: slotKey(day.localDate, mealSlot),
              slot
            }))
          )
          .find(({ slot }) => !slot)?.key
      : undefined;

  return (
    <div className="week-page">
      <header>
        <p className="destination-page__eyebrow">Plan manually</p>
        <h1>Your week</h1>
        <p className="destination-page__lede">
          Choose one saved recipe for each meal slot. Nothing is suggested for
          you automatically.
        </p>
      </header>

      {params.feedback ? (
        <p className="form-message form-message--success" role="status">
          {weekFeedbackMessages[params.feedback]}
        </p>
      ) : null}
      {params.error ? (
        <p className="form-message form-message--error" role="alert">
          That week change could not be applied. Refresh and try again.
        </p>
      ) : null}

      {weekResult.status === "signed_out" ? (
        <section className="foundation-card">
          <h2>Sign in to plan your week</h2>
          <Link className="primary-action primary-action--link" href="/login">
            Sign in
          </Link>
        </section>
      ) : weekResult.status === "unavailable" ? (
        <section className="foundation-card">
          <p className="foundation-card__status">Week unavailable</p>
          <h2>Your plan could not be loaded</h2>
          <p>Refresh and try again.</p>
        </section>
      ) : (
        <>
          <nav aria-label="Week windows" className="week-window-navigation">
            <Link
              href={`/week?start=${addLocalDays(weekResult.week.windowStart, -7)}`}
            >
              Previous 7 days
            </Link>
            <Link href="/week">Current</Link>
            <Link
              href={`/week?start=${addLocalDays(weekResult.week.windowStart, 7)}`}
            >
              Next 7 days
            </Link>
          </nav>

          <div className="week-days">
            {weekResult.week.days.map((day) => (
              <article
                className="week-day"
                data-testid="week-day"
                key={day.localDate}
              >
                <header className="week-day__header">
                  <p className="foundation-card__status">{day.localDate}</p>
                  <h2>{formatLocalDate(day.localDate)}</h2>
                </header>
                <div className="week-slots">
                  {day.slots.map(({ mealSlot, slot }) => (
                    <section
                      className="week-slot"
                      data-testid="week-slot"
                      key={mealSlot}
                    >
                      <header className="week-slot__header">
                        <h3>{mealSlot[0].toUpperCase() + mealSlot.slice(1)}</h3>
                        {slot ? (
                          <span
                            className={`week-status week-status--${slot.status}`}
                          >
                            {slot.status}
                          </span>
                        ) : null}
                      </header>
                      {slot ? (
                        <>
                          <p>
                            <Link href={`/recipes/${slot.recipe.id}`}>
                              {slot.recipe.title}
                            </Link>
                          </p>
                          {slot.note ? (
                            <p className="week-slot__note">{slot.note}</p>
                          ) : null}
                          <SlotStatusActions
                            slotId={slot.id}
                            status={slot.status}
                            windowStart={weekResult.week.windowStart}
                          />
                        </>
                      ) : (
                        <RecipeSlotPicker
                          localDate={day.localDate}
                          mealSlot={mealSlot}
                          recipes={recipes}
                          selectedRecipeId={
                            firstOpenSlotKey ===
                            slotKey(day.localDate, mealSlot)
                              ? params.recipeId
                              : undefined
                          }
                          windowStart={weekResult.week.windowStart}
                        />
                      )}
                    </section>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
