"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { discardBatch } from "@/modules/storage/discard-actions";
import { initialDiscardFormState } from "@/modules/storage/discard-form-state";

type DiscardBatchFormProps = {
  batchId: string;
  idempotencyKey: string;
  returnTo: "/today" | "/kitchen";
};

function DiscardButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="secondary-action secondary-action--danger"
      disabled={pending}
      type="submit"
    >
      {pending ? "Discarding..." : "Discard remaining portions"}
    </button>
  );
}

export function DiscardBatchForm({
  batchId,
  idempotencyKey,
  returnTo
}: DiscardBatchFormProps) {
  const [state, action] = useActionState(discardBatch, initialDiscardFormState);

  return (
    <form action={action} className="discard-batch-form">
      <input name="batchId" type="hidden" value={batchId} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input name="returnTo" type="hidden" value={returnTo} />
      {state.status === "error" ? (
        <p className="form-message form-message--error" role="alert">
          {state.message}
        </p>
      ) : null}
      <DiscardButton />
    </form>
  );
}
