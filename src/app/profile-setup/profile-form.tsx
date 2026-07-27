"use client";

import { useActionState, useSyncExternalStore } from "react";

import { completeBabyProfile } from "@/modules/profiles/actions";
import { initialFormState } from "@/modules/profiles/form-state";

const mealSlots = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" }
] as const;

const subscribeToTimeZone = () => () => {};

export function ProfileForm() {
  const [state, formAction, isPending] = useActionState(
    completeBabyProfile,
    initialFormState
  );
  const suggestedTimeZone = useSyncExternalStore(
    subscribeToTimeZone,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => ""
  );

  return (
    <form action={formAction} className="profile-form">
      <label className="field">
        <span>Nickname (optional)</span>
        <input autoComplete="off" maxLength={80} name="nickname" type="text" />
      </label>

      <label className="field">
        <span>Birth date</span>
        <input name="birthDate" required type="date" />
      </label>

      <label className="field">
        <span>Time zone</span>
        <input
          autoComplete="off"
          defaultValue={suggestedTimeZone}
          key={suggestedTimeZone || "time-zone-loading"}
          name="timeZone"
          required
          type="text"
        />
        <small>Suggested from this device. You can edit it.</small>
      </label>

      <fieldset>
        <legend>Feeding style</legend>
        <label className="choice">
          <input
            name="feedingStyle"
            required
            type="radio"
            value="finger_foods"
          />
          <span>Finger foods</span>
        </label>
        <label className="choice">
          <input name="feedingStyle" required type="radio" value="spoon_fed" />
          <span>Spoon-fed foods</span>
        </label>
        <label className="choice">
          <input name="feedingStyle" required type="radio" value="mixed" />
          <span>Mixed feeding</span>
        </label>
      </fieldset>

      <fieldset>
        <legend>Solid-food meal slots</legend>
        <p className="field-help">Choose one, two, or three.</p>
        {mealSlots.map((mealSlot) => (
          <label className="choice" key={mealSlot.value}>
            <input name="mealSlots" type="checkbox" value={mealSlot.value} />
            <span>{mealSlot.label}</span>
          </label>
        ))}
      </fieldset>

      <button className="primary-action" disabled={isPending} type="submit">
        {isPending ? "Saving…" : "Finish setup"}
      </button>

      {state.status === "error" ? (
        <p className="form-message form-message--error" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
