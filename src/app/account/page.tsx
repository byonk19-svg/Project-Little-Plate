import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { AccountDeletionForm } from "./account-deletion-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account"
};

export default async function AccountPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    redirect("/login");
  }

  return (
    <article className="account-page">
      <div>
        <p className="destination-page__eyebrow">Account control</p>
        <h1>Delete account and household data</h1>
        <p className="destination-page__lede">
          This permanent action is available to the signed-in caregiver only.
        </p>
      </div>

      <section className="account-deletion-card" aria-labelledby="scope-title">
        <h2 id="scope-title">What deletion includes</h2>
        <p data-testid="deletion-scope">
          Your sign-in identity and Little Plate household records are removed
          together, including the baby profile, plans, inventory, and history.
          Reviewed catalog content is shared product content and is not part of
          your household record.
        </p>
        <h3>Operational retention</h3>
        <p data-testid="deletion-retention">
          Little Plate keeps no separate application copy after the deletion
          completes. Protected backup snapshots, if enabled for this deployment,
          may contain an encrypted copy until their configured automatic expiry.
          They are not normally accessible and are used only for whole-service
          disaster recovery.
        </p>
        <p>
          Deletion cannot be undone. If the request fails, the transaction rolls
          back and this page remains available so you can retry.
        </p>
        <AccountDeletionForm />
      </section>
    </article>
  );
}
