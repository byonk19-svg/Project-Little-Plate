"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizePreparedNote } from "@/modules/prepared-notes/domain";

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

export async function createPreparedNote(formData: FormData): Promise<void> {
  const recipeId = String(formData.get("recipeId") ?? "");
  const weekSlotId = String(formData.get("weekSlotId") ?? "");
  const parsed = normalizePreparedNote({
    status: String(formData.get("status") ?? ""),
    portionCount: String(formData.get("portionCount") ?? ""),
    notes: String(formData.get("notes") ?? "")
  });
  if (!/^[0-9a-f-]{36}$/i.test(recipeId) || !parsed.ok) {
    redirect("/kitchen?error=invalid");
  }

  const context = await householdContext();
  if (!context) redirect("/kitchen?error=setup");
  const result = await context.supabase.from("prepared_notes").insert({
    household_id: context.householdId,
    recipe_id: recipeId,
    week_slot_id: /^[0-9a-f-]{36}$/i.test(weekSlotId) ? weekSlotId : null,
    status: parsed.value.status,
    portion_count: parsed.value.portionCount,
    notes: parsed.value.notes
  });
  revalidatePath("/kitchen");
  revalidatePath("/today");
  redirect(`/kitchen?${result.error ? "error=save" : "saved=1"}`);
}

export async function archivePreparedNote(noteId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(noteId)) return;
  const context = await householdContext();
  if (!context) return;
  await context.supabase
    .from("prepared_notes")
    .update({ status: "archived" })
    .eq("id", noteId);
  revalidatePath("/kitchen");
  redirect("/kitchen?saved=1");
}
