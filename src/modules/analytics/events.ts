import type { SupabaseClient } from "@supabase/supabase-js";

type Outcome = "success" | "rejected";

export const productEventReasonCodes = [
  "unavailable",
  "unexpected_outcome",
  "batch_unavailable",
  "planned_component_unavailable",
  "component_already_served",
  "meal_not_planned",
  "preparation_not_approved",
  "food_restricted",
  "restriction_status_unknown",
  "required_ability_not_observed",
  "eligibility_unavailable",
  "batch_lifecycle_unavailable",
  "batch_expired",
  "batch_depleted",
  "batch_terminal",
  "batch_not_untouched",
  "invalid_batch_transition",
  "transition_rule_unavailable",
  "portion_not_returnable",
  "served_event_unavailable",
  "invalid_correction",
  "batch_already_discarded",
  "storage_rule_missing",
  "storage_rule_ambiguous",
  "storage_location_unsupported",
  "invalid_portion_count",
  "plan_stale",
  "meal_unavailable",
  "component_unavailable",
  "meal_locked",
  "component_locked",
  "meal_already_served",
  "preparation_required",
  "quick_backup_unavailable",
  "meal_component_limit_reached",
  "preparation_already_planned",
  "target_meal_not_empty",
  "source_meal_empty",
  "source_preparation_changed",
  "meal_slot_not_configured",
  "invalid_local_date",
  "invalid_meal_status",
  "nothing_to_undo",
  "undo_state_changed",
  "idempotency_key_conflict",
  "snapshot_unavailable",
  "invalid_snapshot",
  "no_eligible_candidate",
  "locked_component_ineligible",
  "storage_infeasible",
  "planner_input_stale",
  "locked_decision_changed",
  "invalid_generated_output",
  "candidate_no_longer_eligible",
  "inventory_no_longer_available",
  "storage_strategy_unavailable"
] as const;

const productEventReasonCodeSet = new Set<string>(productEventReasonCodes);

export type ProductEvent =
  | {
      name: "today_opened";
      key: string;
      state: "ready" | "preparation_required" | "empty" | "unavailable";
    }
  | {
      name: "meal_choice_timed";
      key: string;
      state: "serve" | "prepare";
      durationBucket:
        "under_10_seconds" | "10_to_30_seconds" | "over_30_seconds";
    }
  | {
      name: "serving_outcome";
      key: string;
      operation: "serve";
      outcome: Outcome;
      reasonCode?: string;
    }
  | {
      name: "batch_outcome";
      key: string;
      operation:
        | "create"
        | "freeze"
        | "begin_thaw"
        | "mark_thawed"
        | "return_untouched"
        | "finish"
        | "correct"
        | "discard";
      outcome: Outcome;
      reasonCode?: string;
    }
  | {
      name: "swap_outcome";
      key: string;
      operation: "swap_component" | "swap_meal";
      outcome: Outcome;
      reasonCode?: string;
    }
  | {
      name: "quick_backup_outcome";
      key: string;
      operation: "use_quick_backup";
      outcome: Outcome;
      reasonCode?: string;
    }
  | {
      name: "generation_outcome" | "generation_failed";
      key: string;
      operation: "generate" | "regenerate";
      outcome: Outcome;
      reasonCode?: string;
    }
  | {
      name: "feedback_submitted";
      key: string;
      workflow: "today" | "week" | "kitchen" | "foods";
      frictionCode:
        | "inventory_inaccurate"
        | "answer_not_clear"
        | "logging_too_slow"
        | "warning_missed"
        | "suggestion_impractical"
        | "network_or_retry";
      severity: "minor" | "blocking";
    };

export type ProductEventRpc = {
  p_event_name: ProductEvent["name"];
  p_event_key: string;
  p_outcome: Outcome | null;
  p_reason_code: string | null;
  p_operation: string | null;
  p_state: string | null;
  p_duration_bucket: string | null;
  p_workflow: string | null;
  p_friction_code: string | null;
  p_severity: string | null;
};

export function toProductEventRpc(event: ProductEvent): ProductEventRpc {
  return {
    p_event_name: event.name,
    p_event_key: event.key,
    p_outcome: "outcome" in event ? event.outcome : null,
    p_reason_code: "reasonCode" in event ? (event.reasonCode ?? null) : null,
    p_operation: "operation" in event ? event.operation : null,
    p_state: "state" in event ? event.state : null,
    p_duration_bucket: "durationBucket" in event ? event.durationBucket : null,
    p_workflow: "workflow" in event ? event.workflow : null,
    p_friction_code: "frictionCode" in event ? event.frictionCode : null,
    p_severity: "severity" in event ? event.severity : null
  };
}

export async function recordProductEvent(
  supabase: SupabaseClient,
  event: ProductEvent
): Promise<void> {
  await supabase.rpc("record_product_event", toProductEventRpc(event));
}

export function safeReasonCode(value: unknown): string {
  return typeof value === "string" && productEventReasonCodeSet.has(value)
    ? value
    : "unavailable";
}
