"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  initialSessionFormState,
  type SessionFormState
} from "@/modules/profiles/session-form-state";
import {
  SIGN_OUT_COMPLETE_COOKIE,
  SIGN_OUT_COMPLETE_MAX_AGE_SECONDS
} from "@/modules/profiles/session-marker";

export async function signOut(
  _previousState: SessionFormState = initialSessionFormState
): Promise<SessionFormState> {
  void _previousState;
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    return {
      status: "error",
      message:
        "We could not confirm your session, so we did not report sign-out as complete. Refresh this page and try again."
    };
  }

  const { error } = await supabase.auth.signOut({ scope: "local" });

  if (error) {
    return {
      status: "error",
      message:
        "We could not sign you out. Your session is still active; please try again."
    };
  }

  const cookieStore = await cookies();
  cookieStore.set(SIGN_OUT_COMPLETE_COOKIE, "1", {
    httpOnly: true,
    maxAge: SIGN_OUT_COMPLETE_MAX_AGE_SECONDS,
    path: "/login",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
  redirect("/login?signedOut=1");
}
