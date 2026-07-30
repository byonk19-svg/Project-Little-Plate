"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  initialSessionFormState,
  type SessionFormState
} from "@/modules/profiles/session-form-state";

export async function signOut(
  _previousState: SessionFormState = initialSessionFormState
): Promise<SessionFormState> {
  void _previousState;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });

  if (error) {
    return {
      status: "error",
      message:
        "We could not sign you out. Your session is still active; please try again."
    };
  }

  redirect("/login?signedOut=1");
}
