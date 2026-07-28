import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentWeek } from "@/modules/meals/queries";
import { mealSlotLabels } from "@/modules/meals/presentation";

export const metadata: Metadata = {
  title: "Week"
};

type WeekPageProps = {
  searchParams: Promise<{ planned?: string }>;
};

function formatLocalDate(localDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${localDate}T00:00:00Z`));
}

export default async function WeekPage({ searchParams }: WeekPageProps) {
  const [{ planned }, week] = await Promise.all([
    searchParams,
    getCurrentWeek()
  ]);

  return (
    <div className="week-page">
      <header>
        <p className="destination-page__eyebrow">Plan ahead</p>
        <h1>Your week</h1>
        <p className="destination-page__lede">
          Seven local days with the meal slots configured for your baby.
        </p>
      </header>

      {planned === "1" ? (
        <p className="form-message form-message--success" role="status">
          Tomorrow&apos;s meal was updated.
        </p>
      ) : null}

      {week.status === "unavailable" ? (
        <section className="foundation-card">
          <p className="foundation-card__status">Week unavailable</p>
          <h2>The current plan could not be loaded</h2>
          <p>
            Complete the baby profile or refresh. No meal information is guessed
            while the profile and local time zone are unavailable.
          </p>
        </section>
      ) : (
        <>
          <p className="week-page__timezone">Dates use {week.plan.timeZone}.</p>
          <div className="week-days">
            {week.plan.days.map((day, dayIndex) => (
              <article
                className="week-day"
                data-testid="week-day"
                key={day.localDate}
              >
                <header className="week-day__header">
                  <p className="foundation-card__status">
                    {dayIndex === 0
                      ? "Today"
                      : dayIndex === 1
                        ? "Tomorrow"
                        : `Day ${dayIndex + 1}`}
                  </p>
                  <h2>{formatLocalDate(day.localDate)}</h2>
                </header>
                <div className="week-slots">
                  {day.slots.map((slot) => (
                    <section
                      className="week-slot"
                      key={`${day.localDate}-${slot.mealSlot}`}
                    >
                      <h3>{mealSlotLabels[slot.mealSlot]}</h3>
                      {slot.components.length === 0 ? (
                        <p className="week-slot__empty">Nothing planned yet.</p>
                      ) : (
                        <ol className="week-components">
                          {slot.components.map((component) => (
                            <li key={component.componentId}>
                              <strong>{component.preparationName}</strong>
                              <span>{component.foodName}</span>
                              {component.servingStatus === "served" ? (
                                <span className="week-components__served">
                                  Served
                                </span>
                              ) : (
                                <Link
                                  className="week-components__action"
                                  href={`/kitchen?componentId=${component.componentId}`}
                                >
                                  Prepare and refrigerate
                                </Link>
                              )}
                            </li>
                          ))}
                        </ol>
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
