import type { Metadata } from "next";
import Link from "next/link";

import { DestinationPage } from "@/components/shell/destination-page";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Today"
};

export default async function TodayPage() {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const { data: babies } = claimsData?.claims
    ? await supabase
        .from("babies")
        .select("nickname")
        .eq("is_active", true)
        .limit(1)
    : { data: null };
  const activeBaby = babies?.[0];

  return (
    <>
      <DestinationPage
        eyebrow="Next meal"
        title="Today"
        description="A calm starting point for the next realistic meal."
        nextStep="A later ticket will connect reviewed preparations, valid inventory, and the next planned meal here."
      />
      {activeBaby ? (
        <div className="profile-ready">
          <p>
            {(activeBaby.nickname as string | null) ?? "Your baby"}’s profile is
            ready.
          </p>
          <Link href="/feeding-setup">Configure feeding eligibility</Link>
        </div>
      ) : (
        <Link className="primary-action primary-action--link" href="/login">
          Set up caregiver account
        </Link>
      )}
    </>
  );
}
