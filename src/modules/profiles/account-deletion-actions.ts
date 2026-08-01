"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  initialAccountDeletionFormState,
  type AccountDeletionFormState
} from "@/modules/profiles/account-deletion-form-state";

export async function deleteCaregiverAccount(
  _previousState: AccountDeletionFormState = initialAccountDeletionFormState,
  formData: FormData
): Promise<AccountDeletionFormState> {
  void _previousState;
  const confirmation = String(formData.get("confirmation") ?? "");
  const understood = formData.get("understood") === "yes";
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");

  if (confirmation !== "DELETE") {
    return {
      status: "error",
      message: 'Type "DELETE" exactly to confirm.'
    };
  }
  if (!understood) {
    return {
      status: "error",
      message: "Confirm that you understand deletion cannot be undone."
    };
  }
  if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
    return {
      status: "error",
      message: "This deletion request is invalid. Refresh and try again."
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims) {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc("delete_caregiver_account", {
    p_confirmation: confirmation,
    p_idempotency_key: idempotencyKey
  });

  if (
    error ||
    typeof data !== "object" ||
    data === null ||
    Array.isArray(data)
  ) {
    return {
      status: "error",
      message:
        "We could not confirm the deletion result. Refresh this page. If your account still opens, retry the request; if you are signed out, the deletion may already be complete."
    };
  }

  const result = data as Record<string, unknown>;
  if (result.status === "deleted" || result.status === "already_deleted") {
    await supabase.auth.signOut({ scope: "local" });
    const cookieStore = await cookies();
    cookieStore.set("little-plate-deletion-complete", "1", {
      httpOnly: true,
      maxAge: 60,
      path: "/login",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
    redirect("/login");
  }

  return {
    status: "error",
    message:
      result.reason === "shared_household_requires_support"
        ? "This household has more than one caregiver account. No data was deleted; contact support for a coordinated deletion."
        : "Deletion was not completed. Your account and household data remain available."
  };
}
