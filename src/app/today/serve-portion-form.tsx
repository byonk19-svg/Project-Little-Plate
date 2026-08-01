"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { servePlannedPortion } from "@/modules/meals/serving-actions";
import { initialServingFormState } from "@/modules/meals/serving-form-state";

type ServePortionFormProps = {
  batchId: string;
  mealComponentId: string;
  idempotencyKey: string;
  label?: string;
};

function ServeButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="primary-action"
      data-meal-choice="serve"
      disabled={pending}
      type="submit"
    >
      {pending ? "Serving…" : label}
    </button>
  );
}

export function ServePortionForm({
  batchId,
  mealComponentId,
  idempotencyKey,
  label = "Serve one portion"
}: ServePortionFormProps) {
  const [state, action] = useActionState(
    servePlannedPortion,
    initialServingFormState
  );

  return (
    <form action={action} className="serve-portion-form">
      <input name="batchId" type="hidden" value={batchId} />
      <input name="mealComponentId" type="hidden" value={mealComponentId} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      {state.status === "error" ? (
        <p className="form-message form-message--error" role="alert">
          {state.message}
        </p>
      ) : null}
      <ServeButton label={label} />
    </form>
  );
}
