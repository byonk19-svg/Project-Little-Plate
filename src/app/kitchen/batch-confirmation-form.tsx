"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createRefrigeratedBatch } from "@/modules/storage/actions";
import { initialRefrigeratedBatchFormState } from "@/modules/storage/form-state";

type BatchConfirmationFormProps = {
  mealComponentId: string;
  preparedOrOpenedAt: string;
  idempotencyKey: string;
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="primary-action" disabled={pending} type="submit">
      {pending ? "Creating batch…" : "Refrigerate 2 portions"}
    </button>
  );
}

export function BatchConfirmationForm({
  mealComponentId,
  preparedOrOpenedAt,
  idempotencyKey
}: BatchConfirmationFormProps) {
  const [state, action] = useActionState(
    createRefrigeratedBatch,
    initialRefrigeratedBatchFormState
  );

  return (
    <form action={action} className="batch-confirmation-form">
      <input name="mealComponentId" type="hidden" value={mealComponentId} />
      <input
        name="preparedOrOpenedAt"
        type="hidden"
        value={preparedOrOpenedAt}
      />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      {state.status === "error" ? (
        <p className="form-message form-message--error" role="alert">
          {state.message}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
