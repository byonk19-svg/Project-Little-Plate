import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Baby profile"
};

export default async function ProfileSetupPage() {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    redirect("/login");
  }

  const { data: babies } = await supabase
    .from("babies")
    .select("id")
    .eq("is_active", true)
    .limit(1);

  if (babies && babies.length > 0) {
    redirect("/today");
  }

  return (
    <article className="auth-page">
      <div>
        <p className="destination-page__eyebrow">Profile setup</p>
        <h1>Tell us about your baby</h1>
        <p className="destination-page__lede">
          Add only what Little Plate needs to shape the daily plan.
        </p>
      </div>

      <aside className="safety-note">
        <strong>Birthday is only part of the picture.</strong>
        <span>
          Preparation options use feeding skills, not birthday alone. A later
          setup step will let you record what your baby can currently manage.
        </span>
      </aside>

      <ProfileForm />
    </article>
  );
}
