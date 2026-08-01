"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordProductEvent, safeReasonCode } from "@/modules/analytics/events";
import { isJsonRecord } from "@/modules/meals/transport";
import type { RefrigeratedBatchFormState } from "@/modules/storage/form-state";

const rejectionMessages: Record<string, string> = {
  planned_component_unavailable:
    "This planned preparation is no longer available.",
  eligibility_unavailable:
    "Preparation eligibility could not be verified, so no batch was created.",
  preparation_not_approved: "This reviewed preparation is no longer available.",
  storage_rule_missing:
    "Reviewed refrigerator guidance is unavailable for this preparation.",
  storage_rule_ambiguous:
    "Reviewed refrigerator guidance is ambiguous, so no batch was created.",
  storage_location_unsupported:
    "Only refrigerator storage is available in this flow.",
  invalid_portion_count: "The batch must contain a valid number of portions."
};

export async function createRefrigeratedBatch(
  _previousState: RefrigeratedBatchFormState,
  formData: FormData
): Promise<RefrigeratedBatchFormState> {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    redirect("/login");
  }

  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  const { data, error } = await supabase.rpc("create_refrigerated_batch", {
    p_meal_component_id: String(formData.get("mealComponentId") ?? ""),
    p_prepared_or_opened_at: String(formData.get("preparedOrOpenedAt") ?? ""),
    p_portion_count: 2,
    p_idempotency_key: idempotencyKey,
    p_storage_location: "refrigerator"
  });

  if (error || !isJsonRecord(data)) {
    return {
      status: "error",
      message: "The batch could not be created. Refresh and try again."
    };
  }

  if (data.status === "rejected" && typeof data.reason === "string") {
    await recordProductEvent(supabase, {
      name: "batch_outcome",
      key: idempotencyKey,
      operation: "create",
      outcome: "rejected",
      reasonCode: safeReasonCode(data.reason)
    });
    return {
      status: "error",
      message:
        rejectionMessages[data.reason] ??
        "The batch was not created because reviewed guidance could not be verified."
    };
  }

  if (data.status !== "created" && data.status !== "existing") {
    return {
      status: "error",
      message: "The batch was not created. Refresh and try again."
    };
  }

  revalidatePath("/kitchen");
  await recordProductEvent(supabase, {
    name: "batch_outcome",
    key: idempotencyKey,
    operation: "create",
    outcome: "success"
  });
  redirect("/kitchen?created=1");
}
