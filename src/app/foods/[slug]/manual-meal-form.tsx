"use client";

import { useActionState } from "react";

import { planPreparationForTomorrow } from "@/modules/meals/actions";
import {
  initialManualMealFormState,
  type ManualMealFormState
} from "@/modules/meals/form-state";
import type { MealSlot } from "@/modules/meals/queries";
import { mealSlotLabels } from "@/modules/meals/presentation";

type ManualMealFormProps = {
  babyId: string;
  preparationSlug: string;
  mealSlots: MealSlot[];
};

export function ManualMealForm({
  babyId,
  preparationSlug,
  mealSlots
}: ManualMealFormProps) {
  const [state, formAction, pending] = useActionState<
    ManualMealFormState,
    FormData
  >(planPreparationForTomorrow, initialManualMealFormState);

  return (
    <form action={formAction} className="manual-meal-form">
      <input name="babyId" type="hidden" value={babyId} />
      <input name="preparationSlug" type="hidden" value={preparationSlug} />
      <label className="field">
        Tomorrow&apos;s meal slot
        <select defaultValue={mealSlots[0]} name="mealSlot">
          {mealSlots.map((mealSlot) => (
            <option key={mealSlot} value={mealSlot}>
              {mealSlotLabels[mealSlot]}
            </option>
          ))}
        </select>
      </label>
      <button className="primary-action" disabled={pending} type="submit">
        {pending ? "Adding to tomorrow..." : "Add to tomorrow's meal"}
      </button>
      {state.status === "error" ? (
        <p className="form-message form-message--error" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
