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
  _previousState: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    redirect("/login");
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

  redirect("/today");
}
