"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isJsonRecord } from "@/modules/meals/transport";
import type { LifecycleFormState } from "@/modules/storage/lifecycle-form-state";

const transitions = new Set([
  "freeze",
  "begin_thaw",
  "mark_thawed",
  "return_untouched",
  "finish",
  "correct"
]);

const rejectionMessages: Record<string, string> = {
  batch_unavailable: "That batch is no longer available.",
  batch_terminal: "That batch is already finished or discarded.",
  batch_depleted: "No portions remain in that batch.",
  batch_not_untouched: "Only a full, untouched batch can be frozen.",
  batch_expired: "The reviewed discard deadline has passed.",
  invalid_batch_transition: "That action is not valid for the batch now.",
  transition_rule_unavailable:
    "Reviewed guidance for that action is unavailable.",
  portion_not_returnable:
    "A served portion cannot be returned unless it stayed untouched and separately stored.",
  served_event_unavailable: "That served portion cannot be returned.",
  invalid_correction: "The inventory correction could not be verified.",
  idempotency_key_conflict:
    "This request could not be verified. Refresh and try again."
};

export async function transitionBatch(
  _previousState: LifecycleFormState,
  formData: FormData
): Promise<LifecycleFormState> {
  const transition = String(formData.get("transition") ?? "");
  if (!transitions.has(transition)) {
    return { status: "error", message: "That batch action is unavailable." };
  }

  const payload: Record<string, string | number> = {};
  const servedEventId = String(formData.get("servedEventId") ?? "");
  const correctsEventId = String(formData.get("correctsEventId") ?? "");
  const targetRemaining = Number(formData.get("targetRemaining"));

  if (transition === "return_untouched") {
    if (formData.get("untouchedConfirmation") !== "confirmed") {
      return {
        status: "error",
        message:
          "Confirm that the portion stayed untouched and separately stored."
      };
    }
    payload.served_event_id = servedEventId;
    payload.exposure_state = "untouched_separately_stored";
  } else if (transition === "correct") {
    payload.corrects_event_id = correctsEventId;
    payload.target_remaining_portions = targetRemaining;
    payload.reason = "inventory_overcount";
  }

  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims) {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc("perform_batch_transition", {
    p_batch_id: String(formData.get("batchId") ?? ""),
    p_transition: transition,
    p_payload: payload,
    p_idempotency_key: String(formData.get("idempotencyKey") ?? "")
  });

  if (error || !isJsonRecord(data) || data.status !== "applied") {
    const reason =
      !error && isJsonRecord(data) && typeof data.reason === "string"
        ? data.reason
        : "";
    return {
      status: "error",
      message:
        rejectionMessages[reason] ??
        "The batch was not changed because its current state could not be verified."
    };
  }

  revalidatePath("/today");
  revalidatePath("/week");
  revalidatePath("/kitchen");
  redirect(`/kitchen?transitioned=${encodeURIComponent(transition)}`);
}
