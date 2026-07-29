import type { Metadata } from "next";
import Link from "next/link";

import { PlannerGenerationForm } from "@/app/week/planner-generation-form";
import { WeekEditForm } from "@/app/week/week-edit-form";
import { mealSlotLabels } from "@/modules/meals/presentation";
import {
  getCurrentWeek,
  getWeekEditOptions,
  type WeekEditOption
} from "@/modules/meals/queries";
import { getPlannerGenerationMetadata } from "@/modules/planner/generation-queries";

export const metadata: Metadata = {
  title: "Week"
};

type WeekPageProps = {
  searchParams: Promise<{
    edited?: string;
    generated?: string;
    planned?: string;
    start?: string;
  }>;
};

const editMessages: Record<string, string> = {
  add_component: "The component was added.",
  delete_component: "The component was removed.",
  set_component_lock: "The component lock was updated.",
  set_meal_lock: "The meal lock was updated.",
  swap_component: "The component was swapped.",
  swap_meal: "The meal was swapped.",
  use_quick_backup: "The quick backup replaced this meal.",
  copy_meal: "The meal was copied.",
  set_meal_status: "The meal status was updated.",
  undo_last_swap: "The most recent swap was undone."
};

const statusLabels = {
  planned: "Planned",
  skipped: "Skipped",
  completed: "Completed"
} as const;

function formatLocalDate(localDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${localDate}T00:00:00Z`));
}

function addLocalDays(localDate: string, amount: number): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function LockBadge({ label }: { label: string }) {
  return <span className="week-lock">{label}</span>;
}

function replacementMessage(reason: string | null): string {
  switch (reason) {
    case "food_restricted":
      return "This food is blocked by the current feeding setup. Replace or remove it.";
    case "required_ability_not_observed":
      return "This preparation no longer matches the observed feeding abilities. Replace or remove it.";
    case "restriction_status_unknown":
      return "The current food restriction status is unavailable. Replace or remove this component.";
    default:
      return "This preparation is no longer currently approved or eligible. Replace or remove it.";
  }
}

function PreparationOptions({ options }: { options: WeekEditOption[] }) {
  return options.length === 0 ? (
    <p className="week-slot__empty">
      No eligible reviewed preparations are available.
    </p>
  ) : null;
}

export default async function WeekPage({ searchParams }: WeekPageProps) {
  const params = await searchParams;
  const [week, editOptions, generation] = await Promise.all([
    getCurrentWeek(params.start),
    getWeekEditOptions(),
    getPlannerGenerationMetadata()
  ]);
  const successMessage = params.edited
    ? editMessages[params.edited]
    : params.planned === "1"
      ? "Tomorrow's meal was updated."
      : params.generated === "1"
        ? "The complete feasible week was committed."
        : null;
  const showsCurrentGeneratedPlan =
    week.status === "ready" &&
    generation.status !== "none" &&
    generation.planId === week.plan.planId &&
    generation.windowStart === week.plan.windowStart;
  const showsCurrentExplanations =
    showsCurrentGeneratedPlan &&
    generation.status === "ready" &&
    generation.version === week.plan.version;

  return (
    <div className="week-page">
      <header>
        <p className="destination-page__eyebrow">Plan ahead</p>
        <h1>Your week</h1>
        <p className="destination-page__lede">
          Seven local days with the meal slots configured for your baby.
        </p>
      </header>

      {successMessage ? (
        <p className="form-message form-message--success" role="status">
          {successMessage}
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
          {!params.start || showsCurrentGeneratedPlan ? (
            <PlannerGenerationForm regenerate={showsCurrentGeneratedPlan} />
          ) : null}

          {showsCurrentExplanations && generation.messages.length > 0 ? (
            <section
              aria-labelledby="planner-explanations"
              className="planner-explanations"
            >
              <p className="foundation-card__status">Why these choices</p>
              <h2 id="planner-explanations">Important planning reasons</h2>
              <ul>
                {generation.messages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="week-overview" aria-labelledby="week-summary">
            <div>
              <p className="week-page__timezone">
                Dates use {week.plan.timeZone}.
              </p>
              <h2 id="week-summary">A calm look at this window</h2>
              <p>{week.plan.varietySummary.copy}</p>
            </div>
            <WeekEditForm
              compact
              expectedVersion={week.plan.version}
              idempotencyKey={crypto.randomUUID()}
              label="Undo most recent swap"
              operation="undo_last_swap"
              windowStart={week.plan.windowStart}
            />
          </section>

          <nav aria-label="Week windows" className="week-window-navigation">
            <Link
              href={`/week?start=${addLocalDays(week.plan.windowStart, -7)}`}
            >
              Previous 7 days
            </Link>
            <Link href="/week">Current</Link>
            <Link
              href={`/week?start=${addLocalDays(week.plan.windowStart, 7)}`}
            >
              Next 7 days
            </Link>
          </nav>

          {editOptions.status === "unavailable" ? (
            <section className="foundation-card">
              <p className="foundation-card__status">Editing unavailable</p>
              <p>
                Reviewed preparation choices could not be verified. Existing
                plans remain visible, but no edit choice is being guessed.
              </p>
            </section>
          ) : null}

          <div className="week-days">
            {week.plan.days.map((day, dayIndex) => (
              <article
                className="week-day"
                data-testid="week-day"
                key={day.localDate}
              >
                <header className="week-day__header">
                  <p className="foundation-card__status">
                    {params.start
                      ? dayIndex === 0
                        ? "Window start"
                        : `Day ${dayIndex + 1}`
                      : dayIndex === 0
                        ? "Today"
                        : dayIndex === 1
                          ? "Tomorrow"
                          : `Day ${dayIndex + 1}`}
                  </p>
                  <h2>{formatLocalDate(day.localDate)}</h2>
                </header>
                <div className="week-slots">
                  {day.slots.map((slot) => {
                    const canEdit =
                      editOptions.status === "ready" &&
                      !slot.isLocked &&
                      slot.status === "planned";
                    const quickBackups =
                      editOptions.status === "ready"
                        ? editOptions.items.filter(
                            (option) => option.isQuickBackup
                          )
                        : [];

                    return (
                      <section
                        className="week-slot"
                        data-testid="week-slot"
                        key={`${day.localDate}-${slot.mealSlot}`}
                      >
                        <header className="week-slot__header">
                          <div>
                            <h3>{mealSlotLabels[slot.mealSlot]}</h3>
                            <span
                              className={`week-status week-status--${slot.status}`}
                            >
                              {statusLabels[slot.status]}
                            </span>
                          </div>
                          {slot.isLocked ? (
                            <LockBadge label="Meal locked" />
                          ) : null}
                        </header>

                        {slot.components.length === 0 ? (
                          <p className="week-slot__empty">
                            Nothing planned yet.
                          </p>
                        ) : (
                          <ol className="week-components">
                            {slot.components.map((component) => (
                              <li
                                data-testid="week-component"
                                key={component.componentId}
                              >
                                <div>
                                  <strong>{component.preparationName}</strong>
                                  <span>{component.foodName}</span>
                                  {component.isQuickBackup ? (
                                    <span className="week-components__backup">
                                      Quick backup
                                    </span>
                                  ) : null}
                                  {component.isLocked ? (
                                    <LockBadge label="Component locked" />
                                  ) : null}
                                </div>
                                {component.servingStatus === "served" ? (
                                  <span className="week-components__served">
                                    Served
                                  </span>
                                ) : component.availabilityState ===
                                  "replacement_required" ? (
                                  <p
                                    className="week-components__replacement"
                                    role="status"
                                  >
                                    {replacementMessage(
                                      component.unavailableReason
                                    )}
                                  </p>
                                ) : slot.status === "planned" ? (
                                  <Link
                                    className="week-components__action"
                                    href={`/kitchen?componentId=${component.componentId}`}
                                  >
                                    Prepare and refrigerate
                                  </Link>
                                ) : null}

                                {editOptions.status === "ready" &&
                                slot.mealId ? (
                                  <details className="week-edit-panel">
                                    <summary>Edit component</summary>
                                    <div className="week-edit-panel__body">
                                      <WeekEditForm
                                        compact
                                        expectedVersion={week.plan.version}
                                        idempotencyKey={crypto.randomUUID()}
                                        fields={{
                                          componentId: component.componentId,
                                          locked: String(!component.isLocked)
                                        }}
                                        label={
                                          component.isLocked
                                            ? "Unlock component"
                                            : "Lock component"
                                        }
                                        operation="set_component_lock"
                                        windowStart={week.plan.windowStart}
                                      />
                                      {!component.isLocked &&
                                      !slot.isLocked &&
                                      slot.status === "planned" ? (
                                        <>
                                          <WeekEditForm
                                            compact
                                            expectedVersion={week.plan.version}
                                            idempotencyKey={crypto.randomUUID()}
                                            fields={{
                                              componentId: component.componentId
                                            }}
                                            label="Swap component"
                                            operation="swap_component"
                                            options={editOptions.items}
                                            windowStart={week.plan.windowStart}
                                          />
                                          <WeekEditForm
                                            compact
                                            expectedVersion={week.plan.version}
                                            idempotencyKey={crypto.randomUUID()}
                                            fields={{
                                              componentId: component.componentId
                                            }}
                                            label="Delete component"
                                            operation="delete_component"
                                            windowStart={week.plan.windowStart}
                                          />
                                        </>
                                      ) : null}
                                    </div>
                                  </details>
                                ) : null}
                              </li>
                            ))}
                          </ol>
                        )}

                        {canEdit && slot.components.length < 3 ? (
                          <details className="week-edit-panel">
                            <summary>Add component</summary>
                            <div className="week-edit-panel__body">
                              <PreparationOptions options={editOptions.items} />
                              {editOptions.items.length > 0 ? (
                                <WeekEditForm
                                  expectedVersion={week.plan.version}
                                  idempotencyKey={crypto.randomUUID()}
                                  fields={{
                                    localDate: day.localDate,
                                    mealSlot: slot.mealSlot
                                  }}
                                  label="Add component"
                                  operation="add_component"
                                  options={editOptions.items}
                                  windowStart={week.plan.windowStart}
                                />
                              ) : null}
                            </div>
                          </details>
                        ) : null}

                        {slot.mealId && editOptions.status === "ready" ? (
                          <details className="week-edit-panel">
                            <summary>Edit meal</summary>
                            <div className="week-edit-panel__body">
                              <WeekEditForm
                                compact
                                expectedVersion={week.plan.version}
                                idempotencyKey={crypto.randomUUID()}
                                fields={{
                                  mealId: slot.mealId,
                                  locked: String(!slot.isLocked)
                                }}
                                label={
                                  slot.isLocked ? "Unlock meal" : "Lock meal"
                                }
                                operation="set_meal_lock"
                                windowStart={week.plan.windowStart}
                              />
                              {!slot.isLocked ? (
                                <>
                                  {slot.status === "planned" ? (
                                    <>
                                      <WeekEditForm
                                        compact
                                        expectedVersion={week.plan.version}
                                        idempotencyKey={crypto.randomUUID()}
                                        fields={{ mealId: slot.mealId }}
                                        label="Swap whole meal"
                                        operation="swap_meal"
                                        options={editOptions.items}
                                        windowStart={week.plan.windowStart}
                                      />
                                      {quickBackups.length > 0 ? (
                                        <WeekEditForm
                                          compact
                                          expectedVersion={week.plan.version}
                                          idempotencyKey={crypto.randomUUID()}
                                          fields={{ mealId: slot.mealId }}
                                          label="Use quick backup"
                                          operation="use_quick_backup"
                                          options={quickBackups}
                                          windowStart={week.plan.windowStart}
                                        />
                                      ) : null}
                                      {slot.components.length > 0 ? (
                                        <WeekEditForm
                                          compact
                                          expectedVersion={week.plan.version}
                                          idempotencyKey={crypto.randomUUID()}
                                          fields={{
                                            mealId: slot.mealId,
                                            mealSlot: slot.mealSlot,
                                            targetLocalDate: addLocalDays(
                                              day.localDate,
                                              1
                                            )
                                          }}
                                          label="Copy to next day"
                                          operation="copy_meal"
                                          windowStart={week.plan.windowStart}
                                        />
                                      ) : null}
                                      <WeekEditForm
                                        compact
                                        expectedVersion={week.plan.version}
                                        idempotencyKey={crypto.randomUUID()}
                                        fields={{
                                          mealId: slot.mealId,
                                          mealStatus: "skipped"
                                        }}
                                        label="Mark skipped"
                                        operation="set_meal_status"
                                        windowStart={week.plan.windowStart}
                                      />
                                      <WeekEditForm
                                        compact
                                        expectedVersion={week.plan.version}
                                        idempotencyKey={crypto.randomUUID()}
                                        fields={{
                                          mealId: slot.mealId,
                                          mealStatus: "completed"
                                        }}
                                        label="Mark completed"
                                        operation="set_meal_status"
                                        windowStart={week.plan.windowStart}
                                      />
                                    </>
                                  ) : (
                                    <WeekEditForm
                                      compact
                                      expectedVersion={week.plan.version}
                                      idempotencyKey={crypto.randomUUID()}
                                      fields={{
                                        mealId: slot.mealId,
                                        mealStatus: "planned"
                                      }}
                                      label="Reopen meal"
                                      operation="set_meal_status"
                                      windowStart={week.plan.windowStart}
                                    />
                                  )}
                                </>
                              ) : null}
                            </div>
                          </details>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
