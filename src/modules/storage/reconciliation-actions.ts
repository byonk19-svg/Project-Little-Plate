"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isJsonRecord } from "@/modules/meals/transport";
import type { ReconciliationFormState } from "@/modules/storage/reconciliation-form-state";

export async function reconcileInventoryProjection(
  _previousState: ReconciliationFormState,
  formData: FormData
): Promise<ReconciliationFormState> {
  void _previousState;
  const supabase = await createSupabaseServerClient();
  const claims = await supabase.auth.getClaims();
  if (claims.error || !claims.data?.claims) redirect("/login");
  const result = await supabase.rpc("reconcile_batch_projection", {
    p_batch_id: String(formData.get("batchId") ?? "")
  });
  if (
    result.error ||
    !isJsonRecord(result.data) ||
    result.data.status !== "reconciled"
  ) {
    revalidatePath("/kitchen");
    return {
      status: "error",
      message:
        "Inventory could not be refreshed. Review the current batch state and try again."
    };
  }
  revalidatePath("/kitchen");
  revalidatePath("/today");
  redirect("/kitchen?inventory=reconciled");
}
