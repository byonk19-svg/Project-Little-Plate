"use server";

import { redirect } from "next/navigation";

import { readPublicEnvironment } from "@/config/environment";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FormState } from "@/modules/profiles/form-state";

export async function requestSignInLink(
  _previousState: FormState,
  formData: FormData
): Promise<FormState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email || !email.includes("@")) {
    return {
      status: "error",
      message: "Enter a valid email address."
    };
  }

  const supabase = await createSupabaseServerClient();
  const { appUrl } = readPublicEnvironment();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: new URL("/auth/callback", appUrl).toString(),
      shouldCreateUser: true
    }
  });

  if (error) {
    return {
      status: "error",
      message: "We could not send the sign-in link. Please try again."
    };
  }

  return {
    status: "success",
    message: "Check your email for a secure sign-in link."
  };
}

export async function completeBabyProfile(
  mode: "create" | "edit",
  _previousState: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    redirect("/login");
  }

  if (mode !== "create" && mode !== "edit") {
    return {
      status: "error",
      message:
        "This profile flow is no longer available. Refresh and try again."
    };
  }

  const { data: activeBabies, error: activeBabyError } = await supabase
    .from("babies")
    .select("id")
    .eq("is_active", true)
    .limit(2);
  const hasOneActiveBaby = !activeBabyError && activeBabies?.length === 1;

  if (
    activeBabyError ||
    (mode === "edit" && !hasOneActiveBaby) ||
    (mode === "create" && activeBabies.length > 0)
  ) {
    return {
      status: "error",
      message:
        "This profile flow is no longer available. Refresh and try again."
    };
  }

  const { error } = await supabase.rpc("complete_baby_profile", {
    p_nickname: String(formData.get("nickname") ?? ""),
    p_birth_date: String(formData.get("birthDate") ?? ""),
    p_time_zone: String(formData.get("timeZone") ?? ""),
    p_feeding_style: String(formData.get("feedingStyle") ?? ""),
    p_meal_slots: formData.getAll("mealSlots").map(String)
  });

  if (error) {
    return {
      status: "error",
      message: "Check the profile details and try again."
    };
  }

  redirect(mode === "edit" ? "/account?profileUpdated=1" : "/today");
}
