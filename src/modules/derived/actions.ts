"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DerivedWorkFormState } from "@/modules/derived/form-state";

const errorState: DerivedWorkFormState = {
  status: "error",
  message: "The Kitchen plan changed. Refresh and try again."
};

export async function dismissPreparationTask(
  _previous: DerivedWorkFormState,
  formData: FormData
): Promise<DerivedWorkFormState> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("dismiss_preparation_task", {
    p_preparation_id: String(formData.get("preparationId") ?? ""),
    p_plan_version: Number(formData.get("planVersion")),
    p_task_fingerprint: String(formData.get("taskFingerprint") ?? ""),
    p_idempotency_key: String(formData.get("idempotencyKey") ?? "")
  });
  if (error || data?.status !== "dismissed") return errorState;
  redirect("/kitchen?work=dismissed");
}

export async function setDerivedGroceryState(
  _previous: DerivedWorkFormState,
  formData: FormData
): Promise<DerivedWorkFormState> {
  const operation = String(formData.get("operation") ?? "");
  const rawValue = formData.get("value");
  if (
    !["set_already_have", "set_checked"].includes(operation) ||
    (rawValue !== "true" && rawValue !== "false")
  ) {
    return errorState;
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("set_derived_grocery_state", {
    p_food_id: String(formData.get("foodId") ?? ""),
    p_operation: operation,
    p_value: rawValue === "true",
    p_idempotency_key: String(formData.get("idempotencyKey") ?? "")
  });
  if (error || data?.status !== "updated") return errorState;
  redirect("/kitchen?grocery=updated");
}

export async function mutateManualGroceryItem(
  _previous: DerivedWorkFormState,
  formData: FormData
): Promise<DerivedWorkFormState> {
  const operation = String(formData.get("operation") ?? "");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("mutate_manual_grocery_item", {
    p_operation: operation,
    p_item_id: formData.get("itemId") ? String(formData.get("itemId")) : null,
    p_payload: {
      name: String(formData.get("name") ?? ""),
      store_section: String(formData.get("storeSection") ?? ""),
      quantity: String(formData.get("quantity") ?? ""),
      is_checked: String(formData.get("checked") ?? "")
    },
    p_idempotency_key: String(formData.get("idempotencyKey") ?? "")
  });
  if (error || data?.status !== "updated") return errorState;
  redirect(`/kitchen?grocery=${operation}`);
}
