import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getFeedingConfiguration } from "@/modules/eligibility/queries";

import { FeedingConfigurationForm } from "./feeding-configuration-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Feeding eligibility"
};

export default async function FeedingSetupPage() {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    redirect("/login");
  }

  const result = await getFeedingConfiguration();

  return (
    <article className="feeding-setup-page">
      <header>
        <Link className="catalog-back-link" href="/today">
          ← Today
        </Link>
        <p className="destination-page__eyebrow">Profile setup</p>
        <h1>Feeding eligibility</h1>
        <p className="destination-page__lede">
          Record what you have observed and the practical choices that should
          shape later planning.
        </p>
      </header>

      {result.status === "unavailable" ? (
        <div className="foundation-card" role="alert">
          <p className="foundation-card__status">Unavailable</p>
          <h2>Feeding setup cannot be loaded</h2>
          <p>
            No eligibility is inferred when the reviewed options or profile
            state cannot be verified. Return to Today and try again.
          </p>
        </div>
      ) : (
        <FeedingConfigurationForm configuration={result.configuration} />
      )}
    </article>
  );
}
