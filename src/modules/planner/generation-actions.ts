"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  initialPlannerGenerationFormState,
  type PlannerGenerationFormState
} from "@/modules/planner/generation-form-state";
import { buildPlannerGenerationAttempt } from "@/modules/planner/generation";

const failureMessages = {
  snapshot_unavailable:
    "The current profile and week could not be checked. Refresh and try again.",
  invalid_snapshot:
    "The current planning information is incomplete. Review feeding setup and try again.",
  no_eligible_candidate:
    "No reviewed preparation currently matches the feeding setup. Review the blocked or missing setup items.",
  locked_component_ineligible:
    "A locked choice is no longer eligible. Unlock or replace that choice before regenerating.",
  storage_infeasible:
    "A complete week cannot be stored safely with the reviewed rules currently available. Add valid Kitchen portions or adjust the week."
} as const;

export async function generateFeasibleWeek(
  _previousState: PlannerGenerationFormState = initialPlannerGenerationFormState,
  formData: FormData
): Promise<PlannerGenerationFormState> {
  void _previousState;
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
    return {
      status: "error",
      message: "The generation request is invalid. Refresh and try again."
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims) {
    redirect("/login");
  }

  const referenceAt = new Date().toISOString();
  const { data: snapshot, error: snapshotError } = await supabase.rpc(
    "get_planner_generation_snapshot",
    { p_reference_at: referenceAt }
  );
  if (snapshotError) {
    return {
      status: "error",
      message: failureMessages.snapshot_unavailable
    };
  }

  const attempt = buildPlannerGenerationAttempt(snapshot);
  if (attempt.status === "infeasible") {
    return {
      status: "error",
      message: failureMessages[attempt.reason]
    };
  }

  const { data, error } = await supabase.rpc("commit_generated_week", {
    p_expected_version: attempt.expectedVersion,
    p_idempotency_key: idempotencyKey,
    p_input_token: attempt.inputToken,
    p_output: attempt.output,
    p_reference_at: attempt.referenceAt
  });

  if (
    error ||
    typeof data !== "object" ||
    data === null ||
    Array.isArray(data) ||
    (data as Record<string, unknown>).status !== "committed"
  ) {
    const reason =
      typeof data === "object" &&
      data !== null &&
      !Array.isArray(data) &&
      typeof (data as Record<string, unknown>).reason === "string"
        ? (data as Record<string, unknown>).reason
        : "";
    return {
      status: "error",
      message:
        reason === "planner_input_stale" || reason === "plan_stale"
          ? "The week changed while it was being generated. Try again with the current plan."
          : reason === "locked_decision_changed"
            ? failureMessages.locked_component_ineligible
            : "The generated week was not committed. Your existing week is unchanged; refresh and try again."
    };
  }

  revalidatePath("/week");
  revalidatePath("/today");
  revalidatePath("/kitchen");
  redirect("/week?generated=1");
}
