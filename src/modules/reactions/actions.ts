"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isJsonRecord } from "@/modules/meals/transport";
import type { ReactionFormState } from "@/modules/reactions/form-state";

const reportRejections: Record<string, string> = {
  served_event_unavailable:
    "That serving record is no longer available. No reaction report was saved.",
  reviewed_guidance_unavailable:
    "Reviewed reaction direction is unavailable. No reaction report was saved.",
  reaction_already_reported:
    "A reaction was already reported for that serving.",
  reaction_block_already_active:
    "This food already has an active reaction safety block.",
  food_already_restricted:
    "This food already has a different active safety restriction.",
  preference_invalid: "The optional preference could not be verified.",
  private_description_too_long:
    "The private description must be 2,000 characters or fewer.",
  idempotency_key_conflict:
    "This reaction report could not be verified. Refresh before trying again."
};

export async function reportFoodReaction(
  _previousState: ReactionFormState,
  formData: FormData
): Promise<ReactionFormState> {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    redirect("/login");
  }

  const preference = String(formData.get("preference") ?? "");
  const { data, error } = await supabase.rpc("report_food_reaction", {
    p_served_event_id: String(formData.get("servedEventId") ?? ""),
    p_guidance_revision_id: String(formData.get("guidanceRevisionId") ?? ""),
    p_preference: preference === "" ? null : preference,
    p_private_description: String(formData.get("privateDescription") ?? ""),
    p_idempotency_key: String(formData.get("idempotencyKey") ?? "")
  });

  if (error || !isJsonRecord(data)) {
    return {
      status: "error",
      message: "The reaction report could not be saved. Refresh and try again."
    };
  }

  if (data.status === "rejected" && typeof data.reason === "string") {
    return {
      status: "error",
      message:
        reportRejections[data.reason] ??
        "The reaction report was not saved because its current state could not be verified."
    };
  }

  if (data.status !== "reported") {
    return {
      status: "error",
      message: "The reaction report could not be verified."
    };
  }

  revalidatePath("/today");
  revalidatePath("/week");
  revalidatePath("/foods");
  revalidatePath("/feeding-setup");
  revalidatePath("/kitchen");
  redirect("/today?reaction=reported");
}

export async function resolveFoodReaction(
  _previousState: ReactionFormState,
  formData: FormData
): Promise<ReactionFormState> {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc("resolve_food_reaction", {
    p_food_id: String(formData.get("foodId") ?? ""),
    p_idempotency_key: String(formData.get("idempotencyKey") ?? "")
  });

  if (error || !isJsonRecord(data) || data.status !== "resolved") {
    return {
      status: "error",
      message:
        isJsonRecord(data) && data.reason === "reaction_block_not_active"
          ? "This reaction safety block is no longer active."
          : "The reaction safety block could not be resolved. Refresh and try again."
    };
  }

  revalidatePath("/today");
  revalidatePath("/week");
  revalidatePath("/foods");
  revalidatePath("/feeding-setup");
  revalidatePath("/kitchen");
  redirect("/feeding-setup?reaction=resolved");
}
