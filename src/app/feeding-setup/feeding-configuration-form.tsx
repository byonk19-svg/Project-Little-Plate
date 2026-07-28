"use client";

import { useActionState } from "react";

import { saveFeedingConfiguration } from "@/modules/eligibility/actions";
import { initialFeedingConfigurationFormState } from "@/modules/eligibility/form-state";
import type { FeedingConfiguration } from "@/modules/eligibility/queries";

const prepDays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
] as const;

export function FeedingConfigurationForm({
  configuration
}: {
  configuration: FeedingConfiguration;
}) {
  const [state, formAction, isPending] = useActionState(
    saveFeedingConfiguration,
    initialFeedingConfigurationFormState
  );
  const preferences = configuration.preferences;

  return (
    <form action={formAction} className="feeding-form">
      <section className="foundation-card" aria-labelledby="abilities-title">
        <p className="foundation-card__status">Observable abilities</p>
        <h2 id="abilities-title">What have you observed?</h2>
        <p>
          Choose observed, not observed, or not sure. Missing and not-sure
          answers never prove that a preparation is eligible.
        </p>
        {configuration.skills.length === 0 ? (
          <div className="safety-note" role="status">
            <strong>No reviewed ability options are available</strong>
            <span>
              Eligibility stays unavailable until reviewed preparation records
              supply supported ability requirements.
            </span>
          </div>
        ) : (
          <div className="feeding-form__rows">
            {configuration.skills.map((skill) => (
              <label className="field" key={skill.id}>
                <span>{skill.label}</span>
                <select
                  defaultValue={skill.status ?? ""}
                  name={`skill:${skill.id}`}
                >
                  <option value="">Not recorded</option>
                  <option value="observed">Observed</option>
                  <option value="not_observed">Not observed</option>
                  <option value="not_sure">Not sure</option>
                </select>
              </label>
            ))}
          </div>
        )}
        <p className="field-help">
          Little Plate records your observation. It does not assess or diagnose
          feeding ability.
        </p>
      </section>

      <section className="foundation-card" aria-labelledby="foods-title">
        <p className="foundation-card__status">Food context</p>
        <h2 id="foods-title">Safety status, exposure, and backups</h2>
        <p>
          Safety status is separate from preference. Exposure history is
          optional, and unknown remains different from not tried.
        </p>
        {configuration.foods.length === 0 ? (
          <div className="safety-note" role="status">
            <strong>No reviewed foods are available</strong>
            <span>
              Food-specific setup stays empty rather than using unreviewed
              records.
            </span>
          </div>
        ) : (
          <div className="food-setup-list">
            {configuration.foods.map((food) => {
              const reactionReported =
                food.restrictionStatus === "reaction_reported";

              return (
                <fieldset className="food-setup-row" key={food.id}>
                  <legend>{food.name}</legend>
                  <label className="field">
                    <span>Safety status for {food.name}</span>
                    <select
                      defaultValue={food.restrictionStatus ?? ""}
                      disabled={reactionReported}
                      name={`restriction:${food.id}`}
                    >
                      <option value="">Choose a safety status</option>
                      <option value="no_known_restriction">
                        No known restriction
                      </option>
                      <option value="confirmed_allergy">
                        Confirmed allergy
                      </option>
                      <option value="directed_exclusion">
                        Directed exclusion
                      </option>
                      <option value="temporary_avoidance">
                        Temporary avoidance
                      </option>
                      {reactionReported ? (
                        <option value="reaction_reported">
                          Reaction reported
                        </option>
                      ) : null}
                    </select>
                  </label>
                  {reactionReported ? (
                    <p className="field-help">
                      Reaction-reported status stays blocked and cannot be
                      changed through ordinary preference editing.
                    </p>
                  ) : null}
                  {food.exposureSelectable ? (
                    <label className="field">
                      <span>Exposure state for {food.name}</span>
                      <select
                        defaultValue={food.exposureState ?? ""}
                        name={`exposure:${food.id}`}
                      >
                        <option value="">Skip / not recorded</option>
                        <option value="unknown">Unknown history</option>
                        <option value="not_tried">Not tried</option>
                        <option value="liked">Liked</option>
                        <option value="neutral">Neutral</option>
                        <option value="disliked">Disliked</option>
                        <option value="skipped">Skipped</option>
                      </select>
                    </label>
                  ) : null}
                  <label className="choice">
                    <input
                      defaultChecked={food.isQuickBackup}
                      name="quickBackups"
                      type="checkbox"
                      value={food.id}
                    />
                    <span>Quick backup: {food.name}</span>
                  </label>
                </fieldset>
              );
            })}
          </div>
        )}
        <p className="field-help">
          Exposure setup may be skipped. Choose no more than eight quick
          backups.
        </p>
      </section>

      <section className="foundation-card" aria-labelledby="planning-title">
        <p className="foundation-card__status">Planning preferences</p>
        <h2 id="planning-title">Keep the week practical</h2>
        <div className="feeding-form__rows">
          <label className="field">
            <span>New-food pace</span>
            <select
              defaultValue={preferences?.newFoodPace ?? "one_per_week"}
              name="newFoodPace"
              required
            >
              <option value="no_new_foods">No new foods this week</option>
              <option value="one_per_week">One per week</option>
              <option value="two_per_week">Two per week</option>
              <option value="three_per_week">Three per week</option>
            </select>
          </label>
          <label className="field">
            <span>Preparation-time preference</span>
            <select
              defaultValue={preferences?.preparationTime ?? "under_30_minutes"}
              name="preparationTime"
              required
            >
              <option value="under_15_minutes">Usually under 15 minutes</option>
              <option value="under_30_minutes">Usually under 30 minutes</option>
              <option value="flexible">Flexible</option>
            </select>
          </label>
          <label className="field">
            <span>Optional prep day</span>
            <select
              defaultValue={
                preferences?.prepDay === null ||
                preferences?.prepDay === undefined
                  ? ""
                  : String(preferences.prepDay)
              }
              name="prepDay"
            >
              <option value="">No preferred day</option>
              {prepDays.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <button className="primary-action" disabled={isPending} type="submit">
        {isPending ? "Saving…" : "Save feeding setup"}
      </button>

      {state.status !== "idle" ? (
        <p
          className={`form-message form-message--${state.status}`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
