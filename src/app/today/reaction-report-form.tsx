"use client";

import { useActionState } from "react";

import { reportFoodReaction } from "@/modules/reactions/actions";
import {
  initialReactionFormState,
  type ReactionFormState
} from "@/modules/reactions/form-state";
import type { ReactionReportContext } from "@/modules/reactions/queries";

export function ReactionReportForm({
  context,
  idempotencyKey
}: {
  context: ReactionReportContext;
  idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState<ReactionFormState, FormData>(
    reportFoodReaction,
    initialReactionFormState
  );

  return (
    <section
      className="foundation-card reaction-report"
      aria-labelledby="reaction-report-title"
    >
      <p className="foundation-card__status">After serving</p>
      <h2 id="reaction-report-title">
        Report a reaction to {context.foodName}
      </h2>
      <p>
        Reporting creates an immediate safety block. This application does not
        interpret symptoms or determine allergy status.
      </p>
      <p className="safety-note">
        <strong>Reviewed care direction</strong>
        <span>{context.guidance}</span>
      </p>
      <p className="batch-source">
        Reviewed {context.reviewedAt} ·{" "}
        <a href={context.sourceUrl} rel="noreferrer" target="_blank">
          {context.sourceTitle}
        </a>
      </p>
      <form action={action}>
        <input
          name="servedEventId"
          type="hidden"
          value={context.servedEventId}
        />
        <input
          name="guidanceRevisionId"
          type="hidden"
          value={context.guidanceRevisionId}
        />
        <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
        <label className="field">
          <span>Optional food preference</span>
          <select defaultValue="" name="preference">
            <option value="">No preference update</option>
            <option value="liked">Liked</option>
            <option value="neutral">Neutral</option>
            <option value="disliked">Disliked</option>
          </select>
        </label>
        <label className="field">
          <span>Private reaction description (optional)</span>
          <textarea maxLength={2000} name="privateDescription" rows={4} />
        </label>
        <p>
          The private description is stored in reaction history and is not
          included in general analytics.
        </p>
        <button className="primary-action" disabled={pending} type="submit">
          {pending ? "Saving safety block…" : "Report reaction and block food"}
        </button>
        {state.status === "error" && state.message ? (
          <p className="form-message form-message--error" role="alert">
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
