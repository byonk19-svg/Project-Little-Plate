"use client";

import { useActionState } from "react";

import { resolveFoodReaction } from "@/modules/reactions/actions";
import {
  initialReactionFormState,
  type ReactionFormState
} from "@/modules/reactions/form-state";

export function ResolveReactionForm({
  foodId,
  foodName,
  idempotencyKey
}: {
  foodId: string;
  foodName: string;
  idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState<ReactionFormState, FormData>(
    resolveFoodReaction,
    initialReactionFormState
  );

  return (
    <form action={action} className="reaction-resolution">
      <input name="foodId" type="hidden" value={foodId} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <p>
        Resolution is a separate audited action. Changing preference does not
        clear this safety block.
      </p>
      <button
        aria-label={`Resolve reaction safety block for ${foodName}`}
        className="secondary-action"
        disabled={pending}
        type="submit"
      >
        {pending ? "Resolving…" : "Resolve reaction safety block"}
      </button>
      {state.status === "error" && state.message ? (
        <p className="form-message form-message--error" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
