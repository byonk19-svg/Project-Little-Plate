import type { Metadata } from "next";
import Link from "next/link";

import { ServePortionForm } from "@/app/today/serve-portion-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mealSlotLabels } from "@/modules/meals/presentation";
import { getTodayMeal } from "@/modules/meals/today-queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Today"
};

type TodayPageProps = {
  searchParams: Promise<{ served?: string }>;
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

function formatLocalDateTime(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone
  }).format(new Date(instant));
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
  const [{ served }, today, profile] = await Promise.all([
    searchParams,
    getTodayMeal(),
    getTodayProfileState()
  ]);

  return (
    <div className="today-page">
      <header>
        <p className="destination-page__eyebrow">Next meal</p>
        <h1>Today</h1>
        <p className="destination-page__lede">
          The current or next planned meal, checked against today&apos;s
          inventory and feeding setup.
        </p>
      </header>

      {served === "1" ? (
        <p className="form-message form-message--success" role="status">
          One portion was served as planned.
        </p>
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
          <Link className="primary-action primary-action--link" href="/foods">
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
                          {formatLocalDateTime(
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
    </div>
  );
}
