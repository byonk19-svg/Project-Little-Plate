"use client";

import { useActionState, useState } from "react";
import { usePathname } from "next/navigation";

import { submitWorkflowFeedback } from "@/modules/analytics/actions";
import { initialFeedbackFormState } from "@/modules/analytics/feedback-form-state";

function currentWorkflow(pathname: string) {
  if (pathname.startsWith("/week")) return "week";
  if (pathname.startsWith("/kitchen")) return "kitchen";
  if (pathname.startsWith("/foods")) return "foods";
  return "today";
}

export function WorkflowFeedbackForm() {
  const pathname = usePathname();
  const [eventKey, setEventKey] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(
    submitWorkflowFeedback,
    initialFeedbackFormState
  );

  return (
    <details className="workflow-feedback">
      <summary>Report workflow friction</summary>
      <form
        action={async (formData) => {
          await action(formData);
          setEventKey(crypto.randomUUID());
        }}
      >
        <p>
          Choose structured options only. Do not enter child, allergy, reaction,
          or medical details.
        </p>
        <input name="eventKey" type="hidden" value={eventKey} />
        <label>
          Workflow
          <select
            defaultValue={currentWorkflow(pathname)}
            name="workflow"
            required
          >
            <option value="today">Today</option>
            <option value="week">Week</option>
            <option value="kitchen">Kitchen</option>
            <option value="foods">Foods</option>
          </select>
        </label>
        <label>
          What got in the way?
          <select defaultValue="" name="frictionCode" required>
            <option disabled value="">
              Choose one
            </option>
            <option value="inventory_inaccurate">Inventory looked wrong</option>
            <option value="answer_not_clear">Next answer was not clear</option>
            <option value="logging_too_slow">Logging took too long</option>
            <option value="warning_missed">A warning was easy to miss</option>
            <option value="suggestion_impractical">
              A suggestion was impractical
            </option>
            <option value="network_or_retry">Network or retry trouble</option>
          </select>
        </label>
        <label>
          Impact
          <select defaultValue="minor" name="severity" required>
            <option value="minor">Slowed me down</option>
            <option value="blocking">Blocked the workflow</option>
          </select>
        </label>
        <button disabled={pending} type="submit">
          {pending ? "Sending..." : "Send structured feedback"}
        </button>
        {state.message ? (
          <p
            className={`form-message form-message--${state.status === "success" ? "success" : "error"}`}
            role={state.status === "success" ? "status" : "alert"}
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </details>
  );
}
