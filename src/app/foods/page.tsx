import type { Metadata } from "next";
import { listPublishedPreparations } from "@/modules/catalog/queries";

import { CatalogBrowser } from "./catalog-browser";
export const metadata: Metadata = {
  title: "Foods"
};

export default async function FoodsPage() {
  const catalog = await listPublishedPreparations();

  return (
    <section className="catalog-page">
      <header>
        <p className="destination-page__eyebrow">Reviewed catalog</p>
        <h1>Foods</h1>
        <p className="destination-page__lede">
          Active preparations with complete review, source, skill, allergen, and
          storage records.
        </p>
      </header>

      {catalog.status === "unavailable" ? (
        <div className="foundation-card" role="status">
          <p className="foundation-card__status">Unavailable</p>
          <h2>Reviewed food information cannot be loaded</h2>
          <p>No preparation guidance is shown when publication checks fail.</p>
        </div>
      ) : catalog.items.length === 0 ? (
        <div className="foundation-card" role="status">
          <p className="foundation-card__status">Awaiting review</p>
          <h2>No reviewed preparations are available yet</h2>
          <p>
            Foods will appear only after their preparation and safety records
            have completed review.
          </p>
        </div>
      ) : (
        <CatalogBrowser items={catalog.items} />
      )}
    </section>
  );
}
