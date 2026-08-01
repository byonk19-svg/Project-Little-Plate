"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { transitionBatch } from "@/modules/storage/lifecycle-actions";
import { initialLifecycleFormState } from "@/modules/storage/lifecycle-form-state";

type Transition =
  | "freeze"
  | "begin_thaw"
  | "mark_thawed"
  | "return_untouched"
  | "finish"
  | "correct";

const labels: Record<Transition, string> = {
  freeze: "Freeze untouched batch",
  begin_thaw: "Begin reviewed thaw",
  mark_thawed: "Mark fully thawed",
  return_untouched: "Return untouched portion",
  finish: "Mark remaining portions finished",
  correct: "Correct inventory down by one"
};

function SubmitButton({ transition }: { transition: Transition }) {
  const { pending } = useFormStatus();
  return (
    <button className="secondary-action" disabled={pending} type="submit">
      {pending ? "Saving..." : labels[transition]}
    </button>
  );
}

export function BatchLifecycleForm({
  batchId,
  transition,
  servedEventId,
  correctsEventId,
  targetRemaining
}: {
  batchId: string;
  transition: Transition;
  servedEventId?: string;
  correctsEventId?: string;
  targetRemaining?: number;
}) {
  const [state, action] = useActionState(
    transitionBatch,
    initialLifecycleFormState
  );

  return (
    <form action={action} className="discard-batch-form">
      <input name="batchId" type="hidden" value={batchId} />
      <input name="transition" type="hidden" value={transition} />
      <input name="idempotencyKey" type="hidden" value={crypto.randomUUID()} />
      {servedEventId ? (
        <input name="servedEventId" type="hidden" value={servedEventId} />
      ) : null}
      {correctsEventId ? (
        <input name="correctsEventId" type="hidden" value={correctsEventId} />
      ) : null}
      {targetRemaining !== undefined ? (
        <input name="targetRemaining" type="hidden" value={targetRemaining} />
      ) : null}
      {transition === "return_untouched" ? (
        <label>
          <input
            name="untouchedConfirmation"
            required
            type="checkbox"
            value="confirmed"
          />{" "}
          I confirm this portion stayed untouched and separately stored.
        </label>
      ) : null}
      {state.status === "error" ? (
        <p className="form-message form-message--error" role="alert">
          {state.message}
        </p>
      ) : null}
      <SubmitButton transition={transition} />
    </form>
  );
}
