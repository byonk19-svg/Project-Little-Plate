import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getFeedingConfiguration } from "@/modules/eligibility/queries";
import { getActiveReactionBlocks } from "@/modules/reactions/queries";

import { FeedingConfigurationForm } from "./feeding-configuration-form";
import { ResolveReactionForm } from "./resolve-reaction-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Feeding eligibility"
};

export default async function FeedingSetupPage({
  searchParams
}: {
  searchParams: Promise<{ reaction?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    redirect("/login");
  }

  const [result, activeReactionBlocks] = await Promise.all([
    getFeedingConfiguration(),
    getActiveReactionBlocks()
  ]);

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

      {params.reaction === "resolved" ? (
        <p className="form-message form-message--success" role="status">
          Reaction safety block resolved. The audited reaction history was
          preserved.
        </p>
      ) : null}

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
        <>
          {activeReactionBlocks === null ? (
            <div className="foundation-card" role="alert">
              <p className="foundation-card__status">Unavailable</p>
              <h2>Reaction safety blocks cannot be loaded</h2>
              <p>
                No block is changed when its audited state cannot be verified.
                Return to Today and try again.
              </p>
            </div>
          ) : null}
          {activeReactionBlocks?.map((food) => (
            <section className="foundation-card" key={food.foodId}>
              <p className="foundation-card__status">
                Active reaction safety block
              </p>
              <h2>{food.foodName} is blocked</h2>
              <ResolveReactionForm
                foodId={food.foodId}
                foodName={food.foodName}
                idempotencyKey={crypto.randomUUID()}
              />
            </section>
          ))}
          <FeedingConfigurationForm configuration={result.configuration} />
        </>
      )}
    </article>
  );
}
