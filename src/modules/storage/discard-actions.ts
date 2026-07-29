"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordProductEvent, safeReasonCode } from "@/modules/analytics/events";
import { isJsonRecord } from "@/modules/meals/transport";
import type { DiscardFormState } from "@/modules/storage/discard-form-state";

const rejectionMessages: Record<string, string> = {
  batch_unavailable:
    "That batch is no longer available. Inventory has been refreshed.",
  batch_already_discarded:
    "That batch was already discarded. Inventory has been refreshed.",
  batch_depleted:
    "No portions remain in that batch. Inventory has been refreshed.",
  idempotency_key_conflict:
    "This discard request could not be verified. Refresh and try again."
};

export async function discardBatch(
  _previousState: DiscardFormState,
  formData: FormData
): Promise<DiscardFormState> {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    redirect("/login");
  }

  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  const { data, error } = await supabase.rpc("discard_batch", {
    p_batch_id: String(formData.get("batchId") ?? ""),
    p_idempotency_key: idempotencyKey
  });

  if (error || !isJsonRecord(data)) {
    return {
      status: "error",
      message: "The batch could not be discarded. Refresh and try again."
    };
  }

  if (data.status === "rejected" && typeof data.reason === "string") {
    await recordProductEvent(supabase, {
      name: "batch_outcome",
      key: idempotencyKey,
      operation: "discard",
      outcome: "rejected",
      reasonCode: safeReasonCode(data.reason)
    });
    revalidatePath("/today");
    revalidatePath("/kitchen");
    return {
      status: "error",
      message:
        rejectionMessages[data.reason] ??
        "The batch was not discarded because its current state could not be verified."
    };
  }

  if (data.status !== "discarded") {
    return {
      status: "error",
      message: "The batch was not discarded. Refresh and try again."
    };
  }

  revalidatePath("/today");
  revalidatePath("/week");
  revalidatePath("/kitchen");
  await recordProductEvent(supabase, {
    name: "batch_outcome",
    key: idempotencyKey,
    operation: "discard",
    outcome: "success"
  });
  const returnTo =
    formData.get("returnTo") === "/today" ? "/today" : "/kitchen";
  redirect(`${returnTo}?discarded=1`);
}
