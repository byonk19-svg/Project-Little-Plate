import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Baby profile"
};

type ProfileSetupPageProps = {
  searchParams: Promise<{ mode?: string }>;
};

export default async function ProfileSetupPage({
  searchParams
}: ProfileSetupPageProps) {
  const params = await searchParams;
  const mode = params.mode === "edit" ? "edit" : "create";
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    redirect("/login");
  }

  const { data: babies } = await supabase
    .from("babies")
    .select("nickname, birth_date, time_zone, feeding_style, meal_slots")
    .eq("is_active", true)
    .limit(2);

  if (mode === "create" && babies && babies.length > 0) {
    redirect("/today");
  }

  if (mode === "edit" && babies?.length !== 1) {
    redirect(babies?.length === 0 ? "/profile-setup" : "/today");
  }

  const activeBaby = mode === "edit" ? babies?.[0] : undefined;
  const feedingStyle =
    activeBaby?.feeding_style === "finger_foods" ||
    activeBaby?.feeding_style === "spoon_fed" ||
    activeBaby?.feeding_style === "mixed"
      ? activeBaby.feeding_style
      : undefined;
  const configuredMealSlots = Array.isArray(activeBaby?.meal_slots)
    ? activeBaby.meal_slots.filter(
        (slot): slot is "breakfast" | "lunch" | "dinner" =>
          slot === "breakfast" || slot === "lunch" || slot === "dinner"
      )
    : [];
  const defaults =
    activeBaby && feedingStyle
      ? {
          nickname:
            typeof activeBaby.nickname === "string" ? activeBaby.nickname : "",
          birthDate: activeBaby.birth_date,
          timeZone: activeBaby.time_zone,
          feedingStyle,
          mealSlots: configuredMealSlots
        }
      : undefined;

  return (
    <article className="auth-page">
      <div>
        <p className="destination-page__eyebrow">
          {mode === "edit" ? "Profile details" : "Profile setup"}
        </p>
        <h1>
          {mode === "edit" ? "Edit baby profile" : "Tell us about your baby"}
        </h1>
        <p className="destination-page__lede">
          {mode === "edit"
            ? "Correct the details Little Plate uses to shape the daily plan."
            : "Add only what Little Plate needs to shape the daily plan."}
        </p>
      </div>

      <aside className="safety-note">
        <strong>Birthday is only part of the picture.</strong>
        <span>
          Preparation options use feeding skills, not birthday alone. A later
          setup step will let you record what your baby can currently manage.
        </span>
      </aside>

      <ProfileForm defaults={defaults} mode={mode} />
    </article>
  );
}
