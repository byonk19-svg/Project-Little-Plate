"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const validMealSlots = new Set(["breakfast", "lunch", "dinner"]);
const validStatuses = new Set(["planned", "skipped", "completed"]);

async function householdContext() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) redirect("/login");
  const profile = await supabase
    .from("user_profiles")
    .select("household_id")
    .single();
  return profile.error || !profile.data?.household_id
    ? null
    : { supabase, householdId: profile.data.household_id as string };
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
  query.set(result.error ? "error" : "saved", "1");
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
  await context.supabase
    .from("recipe_week_slots")
    .update({ status })
    .eq("id", slotId);
  revalidatePath("/week");
  revalidatePath("/today");
  redirect(
    `/week${windowStart ? `?start=${windowStart}&saved=1` : "?saved=1"}`
  );
}

export async function removeRecipeWeekSlot(
  slotId: string,
  windowStart?: string
): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(slotId)) return;
  const context = await householdContext();
  if (!context) return;
  await context.supabase.from("recipe_week_slots").delete().eq("id", slotId);
  revalidatePath("/week");
  revalidatePath("/today");
  revalidatePath("/kitchen");
  redirect(
    `/week${windowStart ? `?start=${windowStart}&saved=1` : "?saved=1"}`
  );
}
