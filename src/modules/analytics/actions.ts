"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  recordProductEvent,
  toProductEventRpc,
  type ProductEvent
} from "@/modules/analytics/events";
import type { FeedbackFormState } from "@/modules/analytics/feedback-form-state";

export async function recordClientProductEvent(
  event: ProductEvent
): Promise<void> {
  if (event.name !== "today_opened" && event.name !== "meal_choice_timed") {
    return;
  }
  const supabase = await createSupabaseServerClient();
  const claims = await supabase.auth.getClaims();
  if (claims.error || !claims.data?.claims) return;
  await recordProductEvent(supabase, event);
}

export async function submitWorkflowFeedback(
  _previousState: FeedbackFormState,
  formData: FormData
): Promise<FeedbackFormState> {
  void _previousState;
  const workflow = String(formData.get("workflow") ?? "");
  const frictionCode = String(formData.get("frictionCode") ?? "");
  const severity = String(formData.get("severity") ?? "");
  const eventKey = String(formData.get("eventKey") ?? "");
  const allowedWorkflows = ["today", "week", "kitchen", "foods"] as const;
  const allowedFriction = [
    "inventory_inaccurate",
    "answer_not_clear",
    "logging_too_slow",
    "warning_missed",
    "suggestion_impractical",
    "network_or_retry"
  ] as const;

  if (
    !allowedWorkflows.includes(workflow as (typeof allowedWorkflows)[number]) ||
    !allowedFriction.includes(
      frictionCode as (typeof allowedFriction)[number]
    ) ||
    (severity !== "minor" && severity !== "blocking") ||
    !/^[0-9a-f-]{36}$/i.test(eventKey)
  ) {
    return {
      status: "error",
      message: "Choose the workflow, friction, and impact before sending."
    };
  }

  const supabase = await createSupabaseServerClient();
  const claims = await supabase.auth.getClaims();
  if (claims.error || !claims.data?.claims) {
    return { status: "error", message: "Sign in before sending feedback." };
  }
  const event: ProductEvent = {
    name: "feedback_submitted",
    key: eventKey,
    workflow: workflow as (typeof allowedWorkflows)[number],
    frictionCode: frictionCode as (typeof allowedFriction)[number],
    severity
  };
  const result = await supabase.rpc(
    "record_product_event",
    toProductEventRpc(event)
  );
  return result.error ||
    typeof result.data !== "object" ||
    result.data === null ||
    (result.data as Record<string, unknown>).status !== "recorded"
    ? {
        status: "error",
        message: "Feedback was not sent. Reconnect and try again."
      }
    : {
        status: "success",
        message: "Workflow feedback recorded without notes or clinical details."
      };
}
