"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
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

  const { data, error } = await supabase.rpc("discard_batch", {
    p_batch_id: String(formData.get("batchId") ?? ""),
    p_idempotency_key: String(formData.get("idempotencyKey") ?? "")
  });

  if (error || !isJsonRecord(data)) {
    return {
      status: "error",
      message: "The batch could not be discarded. Refresh and try again."
    };
  }

  if (data.status === "rejected" && typeof data.reason === "string") {
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
  const returnTo =
    formData.get("returnTo") === "/today" ? "/today" : "/kitchen";
  redirect(`${returnTo}?discarded=1`);
}
