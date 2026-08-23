"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getHouseholdContext } from "@/modules/household/server";
import {
  weekActionQueryKey,
  type RecipeWeekAction
} from "@/modules/meals/recipe-week-feedback";

const validMealSlots = new Set(["breakfast", "lunch", "dinner"]);
const validStatuses = new Set(["planned", "skipped", "completed"]);

async function householdContext() {
  const context = await getHouseholdContext();
  if (context.status === "signed_out") redirect("/login");
  return context.status === "authenticated" ? context : null;
}

function readDate(value: FormDataEntryValue | null): string | null {
  const date = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export async function saveRecipeWeekSlot(formData: FormData): Promise<void> {
  const localDate = readDate(formData.get("localDate"));
  const mealSlot = String(formData.get("mealSlot") ?? "");
  const recipeId = String(formData.get("recipeId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const windowStart = readDate(formData.get("windowStart"));

  if (
    !localDate ||
    !validMealSlots.has(mealSlot) ||
    !/^[0-9a-f-]{36}$/i.test(recipeId)
  ) {
    redirect(
      `/week${windowStart ? `?start=${windowStart}&error=invalid` : "?error=invalid"}`
    );
  }

  const context = await householdContext();
  if (!context) redirect(`/week?error=setup`);

  const result = await context.supabase.from("recipe_week_slots").upsert(
    {
      household_id: context.householdId,
      recipe_id: recipeId,
      local_date: localDate,
      meal_slot: mealSlot,
      status: "planned",
      note: note || null
    },
    { onConflict: "household_id,local_date,meal_slot" }
  );

  revalidatePath("/week");
  revalidatePath("/today");
  const query = new URLSearchParams();
  if (windowStart) query.set("start", windowStart);
  query.set("feedback", weekActionQueryKey("plan", Boolean(result.error)));
  redirect(`/week?${query.toString()}`);
}

export async function updateRecipeWeekSlotStatus(
  slotId: string,
  status: string,
  windowStart?: string
): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(slotId) || !validStatuses.has(status)) return;
  const context = await householdContext();
  if (!context) return;
  const result = await context.supabase
    .from("recipe_week_slots")
    .update({ status })
    .eq("id", slotId);
  revalidatePath("/week");
  revalidatePath("/today");
  const action: RecipeWeekAction =
    status === "completed"
      ? "complete"
      : status === "skipped"
        ? "skip"
        : "replan";
  redirect(
    `/week${windowStart ? `?start=${windowStart}&` : "?"}feedback=${weekActionQueryKey(action, Boolean(result.error))}`
  );
}

export async function removeRecipeWeekSlot(
  slotId: string,
  windowStart?: string
): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(slotId)) return;
  const context = await householdContext();
  if (!context) return;
  const result = await context.supabase
    .from("recipe_week_slots")
    .delete()
    .eq("id", slotId);
  revalidatePath("/week");
  revalidatePath("/today");
  revalidatePath("/kitchen");
  redirect(
    `/week${windowStart ? `?start=${windowStart}&` : "?"}feedback=${weekActionQueryKey("remove", Boolean(result.error))}`
  );
}
