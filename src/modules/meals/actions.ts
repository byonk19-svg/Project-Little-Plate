"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ManualMealFormState } from "@/modules/meals/form-state";
import { isJsonRecord } from "@/modules/meals/transport";

const rejectionMessages: Record<string, string> = {
  baby_not_accessible:
    "The active baby profile is no longer available. Refresh and try again.",
  meal_slot_not_configured:
    "Choose one of the meal slots configured in the baby profile.",
  food_restricted:
    "This food is blocked by the current safety status. Review feeding setup before planning it.",
  restriction_status_unknown:
    "Record a food safety status in feeding setup before planning this preparation.",
  required_ability_not_observed:
    "This preparation requires an ability that is not recorded as observed.",
  preparation_not_approved:
    "This reviewed preparation is no longer available. Choose another preparation.",
  eligibility_unavailable:
    "Eligibility could not be verified. Refresh and try again.",
  meal_component_limit_reached:
    "This meal already has three components. Choose another configured meal slot."
};

export async function planPreparationForTomorrow(
  _previousState: ManualMealFormState,
  formData: FormData
): Promise<ManualMealFormState> {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc("plan_preparation_for_tomorrow", {
    p_baby_id: String(formData.get("babyId") ?? ""),
    p_preparation_slug: String(formData.get("preparationSlug") ?? ""),
    p_meal_slot: String(formData.get("mealSlot") ?? "")
  });

  if (error || !isJsonRecord(data)) {
    return {
      status: "error",
      message: "The meal could not be updated. Refresh and try again."
    };
  }

  if (data.status === "rejected" && typeof data.reason === "string") {
    return {
      status: "error",
      message:
        rejectionMessages[data.reason] ??
        "The meal was not changed because eligibility could not be verified."
    };
  }

  if (data.status !== "planned") {
    return {
      status: "error",
      message: "The meal was not changed. Refresh and try again."
    };
  }

  revalidatePath("/week");
  redirect("/week?planned=1");
}
