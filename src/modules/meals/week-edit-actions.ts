"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  recordProductEvent,
  safeReasonCode,
  type ProductEvent
} from "@/modules/analytics/events";
import type { WeekEditFormState } from "@/modules/meals/week-edit-form-state";
import { isJsonRecord } from "@/modules/meals/transport";

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const rejectionMessages: Record<string, string> = {
  plan_stale: "This week changed in another view. Refresh and try again.",
  meal_unavailable: "That meal is no longer available in this week.",
  component_unavailable: "That component is no longer available.",
  meal_locked: "Unlock this meal before changing it.",
  component_locked: "Unlock this component before changing it.",
  meal_not_planned: "Reopen this meal before changing its components.",
  component_already_served:
    "A served component cannot be changed. Week has been refreshed.",
  meal_already_served:
    "A meal with a served component cannot be replaced or undone.",
  preparation_required: "Choose a reviewed preparation.",
  preparation_not_approved:
    "That preparation is no longer approved and was not added.",
  food_restricted:
    "That food is blocked by the current feeding setup and was not added.",
  restriction_status_unknown:
    "The current food safety status could not be verified.",
  required_ability_not_observed:
    "The required feeding ability is not currently observed.",
  eligibility_unavailable:
    "Preparation eligibility could not be verified, so Week was unchanged.",
  quick_backup_unavailable:
    "That preparation is not a current eligible quick backup.",
  meal_component_limit_reached:
    "This meal already has the maximum of three components.",
  preparation_already_planned: "That preparation is already part of this meal.",
  target_meal_not_empty:
    "The destination meal already has components. Choose an empty slot.",
  source_meal_empty: "There is nothing in this meal to copy.",
  source_preparation_changed:
    "A preparation in the source meal changed review status. Replace it before copying.",
  meal_slot_not_configured:
    "That meal slot is not configured for the active baby.",
  invalid_local_date: "Choose a valid local date.",
  invalid_meal_status: "That meal status could not be applied.",
  nothing_to_undo: "There is no recent swap available to undo.",
  undo_state_changed:
    "The swapped meal changed after the swap and can no longer be undone.",
  idempotency_key_conflict:
    "This edit could not be verified. Refresh and try again."
};

function formValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

function buildPayload(operation: string, formData: FormData) {
  switch (operation) {
    case "add_component":
      return {
        local_date: formValue(formData, "localDate"),
        meal_slot: formValue(formData, "mealSlot"),
        preparation_slug: formValue(formData, "preparationSlug")
      };
    case "delete_component":
      return { component_id: formValue(formData, "componentId") };
    case "set_component_lock":
      return {
        component_id: formValue(formData, "componentId"),
        locked: formValue(formData, "locked") === "true"
      };
    case "set_meal_lock":
      return {
        meal_id: formValue(formData, "mealId"),
        locked: formValue(formData, "locked") === "true"
      };
    case "swap_component":
      return {
        component_id: formValue(formData, "componentId"),
        preparation_slug: formValue(formData, "preparationSlug")
      };
    case "swap_meal":
    case "use_quick_backup":
      return {
        meal_id: formValue(formData, "mealId"),
        preparation_slug: formValue(formData, "preparationSlug")
      };
    case "copy_meal":
      return {
        source_meal_id: formValue(formData, "mealId"),
        target_local_date: formValue(formData, "targetLocalDate"),
        target_meal_slot: formValue(formData, "mealSlot")
      };
    case "set_meal_status":
      return {
        meal_id: formValue(formData, "mealId"),
        status: formValue(formData, "mealStatus")
      };
    case "undo_last_swap":
      return {};
    default:
      return null;
  }
}

export async function editManualWeek(
  _previousState: WeekEditFormState,
  formData: FormData
): Promise<WeekEditFormState> {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    redirect("/login");
  }

  const operation = formValue(formData, "operation");
  const payload = buildPayload(operation, formData);
  const expectedVersion = Number(formValue(formData, "expectedVersion"));
  const idempotencyKey = formValue(formData, "idempotencyKey");
  const windowStart = formValue(formData, "windowStart");

  if (
    payload === null ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 0 ||
    !idempotencyKey
  ) {
    return {
      status: "error",
      message: "This edit was incomplete. Refresh and try again."
    };
  }

  const { data, error } = await supabase.rpc("edit_manual_week", {
    p_expected_version: expectedVersion,
    p_operation: operation,
    p_payload: payload,
    p_idempotency_key: idempotencyKey
  });

  const trackedName =
    operation === "use_quick_backup"
      ? "quick_backup_outcome"
      : operation === "swap_component" || operation === "swap_meal"
        ? "swap_outcome"
        : null;
  if (trackedName && !error && isJsonRecord(data)) {
    const applied = !error && isJsonRecord(data) && data.status === "applied";
    const rejected =
      data.status === "rejected" && typeof data.reason === "string";
    const event: ProductEvent | null =
      !applied && !rejected
        ? null
        : trackedName === "quick_backup_outcome"
          ? {
              name: trackedName,
              key: idempotencyKey,
              operation: "use_quick_backup",
              outcome: applied ? "success" : "rejected",
              ...(applied
                ? {}
                : {
                    reasonCode: safeReasonCode(
                      !error && isJsonRecord(data) ? data.reason : null
                    )
                  })
            }
          : {
              name: trackedName,
              key: idempotencyKey,
              operation: operation as "swap_component" | "swap_meal",
              outcome: applied ? "success" : "rejected",
              ...(applied
                ? {}
                : {
                    reasonCode: safeReasonCode(
                      !error && isJsonRecord(data) ? data.reason : null
                    )
                  })
            };
    if (event) await recordProductEvent(supabase, event);
  }

  if (error || !isJsonRecord(data)) {
    return {
      status: "error",
      message: "Week could not be updated. Refresh and try again."
    };
  }

  if (data.status === "rejected" && typeof data.reason === "string") {
    revalidatePath("/week");
    revalidatePath("/today");
    revalidatePath("/kitchen");
    return {
      status: "error",
      message:
        rejectionMessages[data.reason] ??
        "Week was unchanged because the edit could not be verified."
    };
  }

  if (data.status !== "applied") {
    return {
      status: "error",
      message: "Week was unchanged. Refresh and try again."
    };
  }

  revalidatePath("/week");
  revalidatePath("/today");
  revalidatePath("/kitchen");
  const query = new URLSearchParams({ edited: operation });
  if (localDatePattern.test(windowStart)) {
    query.set("start", windowStart);
  }
  redirect(`/week?${query.toString()}`);
}
