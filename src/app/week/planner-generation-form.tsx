"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { generateFeasibleWeek } from "@/modules/planner/generation-actions";
import {
  initialPlannerGenerationFormState,
  type PlannerGenerationFormState
} from "@/modules/planner/generation-form-state";

function SubmitButton({ regenerate }: { regenerate: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="primary-action" disabled={pending} type="submit">
      {pending
        ? "Checking the complete week..."
        : regenerate
          ? "Regenerate unlocked choices"
          : "Generate a reviewed week"}
    </button>
  );
}

export function PlannerGenerationForm({ regenerate }: { regenerate: boolean }) {
  const [state, action] = useActionState<PlannerGenerationFormState, FormData>(
    generateFeasibleWeek,
    initialPlannerGenerationFormState
  );

  return (
    <form action={action} className="planner-generation">
      <input name="idempotencyKey" type="hidden" value={crypto.randomUUID()} />
      <input
        name="generationOperation"
        type="hidden"
        value={regenerate ? "regenerate" : "generate"}
      />
      <div>
        <p className="foundation-card__status">Automatic planning</p>
        <h2>
          {regenerate ? "Refresh the unlocked choices" : "Build the week"}
        </h2>
        <p>
          Locked choices stay in place. The current week changes only after
          every meal passes reviewed eligibility and storage checks.
        </p>
      </div>
      {state.status === "error" ? (
        <p className="form-message form-message--error" role="alert">
          {state.message}
        </p>
      ) : null}
      <SubmitButton regenerate={regenerate} />
    </form>
  );
}
