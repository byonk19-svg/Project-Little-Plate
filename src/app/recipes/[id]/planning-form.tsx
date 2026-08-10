"use client";

import { useActionState } from "react";

import { planPersonalRecipe } from "@/modules/recipes/actions";
import {
  initialPersonalPlanningFormState,
  type PersonalPlanningFormState
} from "@/modules/recipes/form-state";
import type { MealSlot } from "@/modules/meals/queries";
import { mealSlotLabels } from "@/modules/meals/presentation";

type PlanningFormProps = {
  babyId: string;
  recipeId: string;
  days: Array<{ localDate: string; slots: Array<{ mealSlot: MealSlot }> }>;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00Z`));
}

export function PlanningForm({ babyId, recipeId, days }: PlanningFormProps) {
  const [state, formAction, pending] = useActionState<
    PersonalPlanningFormState,
    FormData
  >(planPersonalRecipe, initialPersonalPlanningFormState);
  const slots = days[0]?.slots.map((slot) => slot.mealSlot) ?? [];

  return (
    <form action={formAction} className="personal-planning-form">
      <input name="babyId" type="hidden" value={babyId} />
      <input name="recipeId" type="hidden" value={recipeId} />
      <label className="field">
        Week day
        <select defaultValue={days[0]?.localDate} name="localDate">
          {days.map((day) => (
            <option key={day.localDate} value={day.localDate}>
              {formatDate(day.localDate)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Meal slot
        <select defaultValue={slots[0]} name="mealSlot">
          {slots.map((slot) => (
            <option key={slot} value={slot}>
              {mealSlotLabels[slot]}
            </option>
          ))}
        </select>
      </label>
      <button className="primary-action" disabled={pending} type="submit">
        {pending ? "Adding to the week…" : "Add to this week"}
      </button>
      {state.status === "error" ? (
        <p className="form-message form-message--error" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
