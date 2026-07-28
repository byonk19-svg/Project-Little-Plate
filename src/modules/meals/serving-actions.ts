"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ServingFormState } from "@/modules/meals/serving-form-state";
import { isJsonRecord } from "@/modules/meals/transport";

const rejectionMessages: Record<string, string> = {
  batch_unavailable:
    "That prepared portion is no longer available. Today has been refreshed.",
  planned_component_unavailable:
    "That planned component is no longer available. Today has been refreshed.",
  component_already_served:
    "This planned component was already served. Today has been refreshed.",
  preparation_not_approved:
    "This preparation is no longer approved and was not served.",
  food_restricted:
    "This food is blocked by the current feeding setup and was not served.",
  restriction_status_unknown:
    "The current food safety status could not be verified, so nothing was served.",
  required_ability_not_observed:
    "The required feeding ability is not currently observed, so nothing was served.",
  eligibility_unavailable:
    "Preparation eligibility could not be verified, so nothing was served.",
  batch_lifecycle_unavailable:
    "This batch is not in a serveable storage state.",
  batch_expired:
    "The reviewed deadline has passed. This portion was not served.",
  batch_depleted: "No portions remain in this batch. Today has been refreshed.",
  idempotency_key_conflict:
    "This serving request could not be verified. Refresh and try again."
};

export async function servePlannedPortion(
  _previousState: ServingFormState,
  formData: FormData
): Promise<ServingFormState> {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc("serve_planned_portion", {
    p_meal_component_id: String(formData.get("mealComponentId") ?? ""),
    p_batch_id: String(formData.get("batchId") ?? ""),
    p_idempotency_key: String(formData.get("idempotencyKey") ?? "")
  });

  if (error || !isJsonRecord(data)) {
    return {
      status: "error",
      message: "The portion could not be served. Refresh and try again."
    };
  }

  if (data.status === "rejected" && typeof data.reason === "string") {
    revalidatePath("/today");
    revalidatePath("/week");
    revalidatePath("/kitchen");
    return {
      status: "error",
      message:
        rejectionMessages[data.reason] ??
        "The portion was not served because its current state could not be verified."
    };
  }

  if (data.status !== "served") {
    return {
      status: "error",
      message: "The portion was not served. Refresh and try again."
    };
  }

  revalidatePath("/today");
  revalidatePath("/week");
  revalidatePath("/kitchen");
  redirect("/today?served=1");
}
