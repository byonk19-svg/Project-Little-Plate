import type { Metadata } from "next";
import Link from "next/link";

import { ReactionReportForm } from "@/app/today/reaction-report-form";
import { ServePortionForm } from "@/app/today/serve-portion-form";
import { TodayAnalytics } from "@/components/analytics/today-analytics";
import { DiscardBatchForm } from "@/components/storage/discard-batch-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mealSlotLabels } from "@/modules/meals/presentation";
import { getTodayMeal } from "@/modules/meals/today-queries";
import { getReactionReportContext } from "@/modules/reactions/queries";
import { formatStorageLocalDateTime } from "@/modules/storage/presentation";
import { getUseSoonBatches } from "@/modules/storage/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Today"
};

type TodayPageProps = {
  searchParams: Promise<{
    discarded?: string;
    reaction?: string;
    served?: string;
    servedEvent?: string;
  }>;
};

const availabilityLabels = {
  ready: "Ready",
  quick_preparation: "Quick preparation",
  thaw_required: "Thaw required",
  served: "Served",
  unavailable: "Unavailable"
} as const;

function formatLocalDate(localDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${localDate}T00:00:00Z`));
}

async function getTodayProfileState(): Promise<
  | { status: "signed_out" }
  | { status: "profile_ready"; nickname: string | null }
  | { status: "profile_missing" }
> {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    return { status: "signed_out" };
  }

  const { data, error } = await supabase
    .from("babies")
    .select("nickname")
    .eq("is_active", true)
    .limit(1);

  if (error || !data?.[0]) {
    return { status: "profile_missing" };
  }

  return {
    status: "profile_ready",
    nickname: typeof data[0].nickname === "string" ? data[0].nickname : null
  };
}

export default async function TodayPage({ searchParams }: TodayPageProps) {
  const params = await searchParams;
  const [today, profile, useSoon, reactionContext] = await Promise.all([
    getTodayMeal(),
    getTodayProfileState(),
    getUseSoonBatches(),
    getReactionReportContext(params.servedEvent)
  ]);
  const analyticsState =
    today.status === "ready"
      ? today.components.some(
          (component) => component.availabilityState === "ready"
        )
        ? ("ready" as const)
        : ("preparation_required" as const)
      : today.status;

  return (
    <div className="today-page">
      <TodayAnalytics
        eventKey={crypto.randomUUID()}
        mealState={analyticsState}
      />
      <header>
        <p className="destination-page__eyebrow">Next meal</p>
        <h1>Today</h1>
        <p className="destination-page__lede">
          The current or next planned meal, checked against today&apos;s
          inventory and feeding setup.
        </p>
      </header>

      {params.served === "1" ? (
        <p className="form-message form-message--success" role="status">
          One portion was served as planned.
        </p>
      ) : null}

      {params.reaction === "reported" ? (
        <p className="form-message form-message--success" role="status">
          Reaction reported. This food is blocked from Today, Week edits, and
          future planning until the block is explicitly resolved.
        </p>
      ) : null}

      {params.discarded === "1" ? (
        <p className="form-message form-message--success" role="status">
          Remaining portions were discarded.
        </p>
      ) : null}

      {params.servedEvent && params.served === "1" ? (
        reactionContext ? (
          <ReactionReportForm
            context={reactionContext}
            idempotencyKey={crypto.randomUUID()}
          />
        ) : (
          <section className="foundation-card" role="status">
            <p className="foundation-card__status">
              Reaction reporting unavailable
            </p>
            <h2>Reviewed reaction direction could not be verified</h2>
            <p>
              No reaction guidance is being guessed. Refresh after reviewed
              content is available.
            </p>
          </section>
        )
      ) : null}

      {today.status !== "ready" && profile.status === "signed_out" ? (
        <Link className="primary-action primary-action--link" href="/login">
          Set up caregiver account
        </Link>
      ) : null}

      {today.status !== "ready" && profile.status === "profile_ready" ? (
        <div className="profile-ready">
          <p>{profile.nickname ?? "Your baby"}&rsquo;s profile is ready.</p>
          <Link href="/feeding-setup">Configure feeding eligibility</Link>
        </div>
      ) : null}

      {today.status !== "ready" && profile.status === "profile_missing" ? (
        <Link
          className="primary-action primary-action--link"
          href="/profile-setup"
        >
          Complete baby profile
        </Link>
      ) : null}

      {today.status === "empty" ? (
        <section className="foundation-card">
          <p className="foundation-card__status">Nothing planned next</p>
          <h2>Plan a meal when you are ready</h2>
          <p>Today will stay empty rather than inventing a recommendation.</p>
          <Link
            className="primary-action primary-action--link"
            data-meal-choice="prepare"
            href="/foods"
          >
            Browse reviewed foods
          </Link>
        </section>
      ) : today.status === "unavailable" ? (
        <section className="foundation-card">
          <p className="foundation-card__status">Today unavailable</p>
          <h2>The next meal could not be verified</h2>
          <p>
            Refresh or review the baby profile. No food is being recommended
            while current plan and safety state are unavailable.
          </p>
        </section>
      ) : (
        <section className="today-meal">
          <header>
            <p className="foundation-card__status">
              {formatLocalDate(today.localDate)}
            </p>
            <h2>Next planned meal</h2>
            <p>
              {mealSlotLabels[today.mealSlot]} · Dates use {today.timeZone}.
            </p>
          </header>

          <div className="today-components">
            {today.components.map((component) => (
              <article
                className="foundation-card today-component"
                data-testid="today-component"
                key={component.componentId}
              >
                <p
                  className={`batch-status batch-status--${component.availabilityState}`}
                >
                  {availabilityLabels[component.availabilityState]}
                </p>
                <h3>{component.preparationName}</h3>
                <p className="today-component__food">{component.foodName}</p>

                {component.availabilityState === "ready" &&
                component.batchId &&
                component.deadlineAt ? (
                  <>
                    <p>
                      A reviewed refrigerated portion is available.{" "}
                      {component.remainingPortions} remain in this batch.
                    </p>
                    <dl className="batch-facts">
                      <div>
                        <dt>Exact discard deadline</dt>
                        <dd>
                          {formatStorageLocalDateTime(
                            component.deadlineAt,
                            today.timeZone
                          )}
                        </dd>
                      </div>
                    </dl>
                    <p className="safety-note">
                      <strong>Reviewed storage guidance</strong>
                      <span>{component.guidance}</span>
                    </p>
                    <p className="batch-source">
                      Reviewed {component.reviewedAt} ·{" "}
                      <a
                        href={component.sourceUrl ?? undefined}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {component.sourceTitle}
                      </a>
                    </p>
                    <ServePortionForm
                      batchId={component.batchId}
                      idempotencyKey={crypto.randomUUID()}
                      mealComponentId={component.componentId}
                    />
                  </>
                ) : component.availabilityState === "quick_preparation" ? (
                  <p>
                    No valid prepared portion is available. Use the reviewed
                    preparation page before preparing this component.
                  </p>
                ) : component.availabilityState === "thaw_required" ? (
                  <p>
                    This component is not ready to serve. Follow its reviewed
                    thaw workflow in Kitchen.
                  </p>
                ) : component.availabilityState === "served" ? (
                  <p>This planned component was served.</p>
                ) : (
                  <p>
                    This component is not actionable because its current safety
                    or publication state could not be verified.
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {useSoon.status === "ready" && useSoon.items.length > 0 ? (
        <section className="use-soon-section" aria-labelledby="use-soon-title">
          <header>
            <p className="foundation-card__status">Refrigerator priority</p>
            <h2 id="use-soon-title">Use soon</h2>
            <p>
              Unexpired portions due within the next 24 elapsed hours, earliest
              deadline first.
            </p>
          </header>
          <div className="use-soon-list">
            {useSoon.items.map((item) => (
              <article
                className="foundation-card use-soon-card"
                data-testid="use-soon-batch"
                key={item.batchId}
              >
                <p className="batch-status batch-status--use_today">
                  Use within 24 hours
                </p>
                <h3>{item.preparationName}</h3>
                <p>{item.foodName}</p>
                <p>
                  {item.remainingPortions}{" "}
                  {item.remainingPortions === 1 ? "portion" : "portions"}{" "}
                  remaining
                </p>
                <dl className="batch-facts">
                  <div>
                    <dt>Exact discard deadline</dt>
                    <dd>
                      {formatStorageLocalDateTime(
                        item.deadlineAt,
                        useSoon.timeZone
                      )}
                    </dd>
                  </div>
                </dl>
                <p className="safety-note">
                  <strong>Reviewed storage guidance</strong>
                  <span>{item.guidance}</span>
                </p>
                <p className="batch-source">
                  Reviewed {item.reviewedAt} ·{" "}
                  <a href={item.sourceUrl} rel="noreferrer" target="_blank">
                    {item.sourceTitle}
                  </a>
                </p>
                <div className="inventory-actions">
                  {item.nextComponentId ? (
                    <ServePortionForm
                      batchId={item.batchId}
                      idempotencyKey={crypto.randomUUID()}
                      label="Use in next meal"
                      mealComponentId={item.nextComponentId}
                    />
                  ) : (
                    <Link
                      className="primary-action primary-action--link"
                      data-meal-choice="prepare"
                      href={`/foods/${item.preparationSlug}`}
                    >
                      Plan this preparation
                    </Link>
                  )}
                  <DiscardBatchForm
                    batchId={item.batchId}
                    idempotencyKey={crypto.randomUUID()}
                    returnTo="/today"
                  />
                </div>
              </article>
            ))}
          </div>
          <Link href="/kitchen">See all refrigerator inventory</Link>
        </section>
      ) : useSoon.status === "unavailable" ? (
        <section className="foundation-card" aria-labelledby="use-soon-title">
          <p className="foundation-card__status">Use-soon unavailable</p>
          <h2 id="use-soon-title">
            Refrigerator priority could not be verified
          </h2>
          <p>
            Refresh or open Kitchen. No near-term refrigerator task is being
            inferred while current inventory cannot be checked.
          </p>
          <Link href="/kitchen">Open Kitchen</Link>
        </section>
      ) : null}
    </div>
  );
}
