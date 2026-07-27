import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getPublishedPreparation } from "@/modules/catalog/queries";

type FoodDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export const metadata: Metadata = {
  title: "Reviewed preparation"
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00Z`));
}

function durationLabel(hours: number) {
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

export default async function FoodDetailPage({ params }: FoodDetailPageProps) {
  const { slug } = await params;
  const preparation = await getPublishedPreparation(slug);

  if (!preparation) {
    notFound();
  }

  const skills = preparation.tags.filter((tag) => tag.kind === "skill");
  const allergens = preparation.tags.filter((tag) => tag.kind === "allergen");
  const supportedRules = preparation.storageRules.filter(
    (rule) => rule.supportStatus === "supported"
  );

  return (
    <article className="catalog-detail">
      <header>
        <Link className="catalog-back-link" href="/foods">
          ← All foods
        </Link>
        <p className="destination-page__eyebrow">{preparation.foodName}</p>
        <h1>{preparation.preparationName}</h1>
        <p className="destination-page__lede">{preparation.category}</p>
      </header>

      <section className="foundation-card" aria-labelledby="preparation-title">
        <p className="foundation-card__status">Reviewed preparation</p>
        <h2 id="preparation-title">Preparation context</h2>
        <dl className="catalog-facts">
          <div>
            <dt>Method</dt>
            <dd>{preparation.method}</dd>
          </div>
          <div>
            <dt>Shape and texture</dt>
            <dd>{preparation.shapeTexture}</dd>
          </div>
        </dl>
      </section>

      <section className="foundation-card" aria-labelledby="eligibility-title">
        <p className="foundation-card__status">Eligibility</p>
        <h2 id="eligibility-title">Skills and allergen context</h2>
        <dl className="catalog-facts">
          <div>
            <dt>Required skills</dt>
            <dd>{skills.map((tag) => tag.label).join(", ")}</dd>
          </div>
          <div>
            <dt>Allergen tags</dt>
            <dd>{allergens.map((tag) => tag.label).join(", ")}</dd>
          </div>
        </dl>
      </section>

      <section className="foundation-card" aria-labelledby="storage-title">
        <p className="foundation-card__status">Storage</p>
        <h2 id="storage-title">Reviewed storage support</h2>
        {supportedRules.length === 0 ? (
          <div className="safety-note" role="status">
            <strong>Reviewed storage guidance is unavailable</strong>
            <span>
              No storage deadline is shown because this preparation has no
              supported reviewed rule.
            </span>
          </div>
        ) : (
          <div className="storage-rule-list">
            {supportedRules.map((rule) => {
              const heading =
                rule.deadlineKind === "discard_after"
                  ? "Discard-after safety deadline"
                  : rule.deadlineKind === "quality_by"
                    ? "Quality guidance"
                    : "Storage information";

              return (
                <section
                  className={`storage-rule storage-rule--${rule.deadlineKind}`}
                  aria-label={heading}
                  key={`${rule.deadlineKind}-${rule.guidance}`}
                >
                  <h3>{heading}</h3>
                  {rule.durationHours !== null ? (
                    <strong>{durationLabel(rule.durationHours)}</strong>
                  ) : null}
                  <p>{rule.guidance}</p>
                </section>
              );
            })}
          </div>
        )}
      </section>

      <section className="foundation-card" aria-labelledby="provenance-title">
        <p className="foundation-card__status">Provenance</p>
        <h2 id="provenance-title">Source and review record</h2>
        <dl className="catalog-facts">
          <div>
            <dt>Source</dt>
            <dd>
              <a href={preparation.source.url}>{preparation.source.title}</a>,{" "}
              {preparation.source.publisher}
            </dd>
          </div>
          <div>
            <dt>Source date</dt>
            <dd>{formatDate(preparation.source.sourceDate)}</dd>
          </div>
          <div>
            <dt>Reviewed by role</dt>
            <dd>{preparation.reviewerRole}</dd>
          </div>
          <div>
            <dt>Approved</dt>
            <dd>{formatDate(preparation.approvedAt)}</dd>
          </div>
          <div>
            <dt>Next review</dt>
            <dd>{formatDate(preparation.nextReviewAt)}</dd>
          </div>
          <div>
            <dt>Content version</dt>
            <dd>
              {preparation.revisionId}, version {preparation.version}
            </dd>
          </div>
        </dl>
      </section>
    </article>
  );
}
