"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { filterCatalogItems } from "@/modules/catalog/filter";
import type { PublishedPreparationSummary } from "@/modules/catalog/queries";

export function CatalogBrowser({
  items
}: {
  items: PublishedPreparationSummary[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [skill, setSkill] = useState("");
  const [allergen, setAllergen] = useState("");
  const [familiarity, setFamiliarity] = useState<
    "all" | "familiar" | "new" | "unknown"
  >("all");
  const [skillCompatibility, setSkillCompatibility] = useState<
    "all" | "compatible" | "not_confirmed" | "unknown"
  >("all");
  const [preparationTimeBand, setPreparationTimeBand] = useState<
    "all" | "under_15_minutes" | "15_to_30_minutes" | "over_30_minutes"
  >("all");
  const [storage, setStorage] = useState<"all" | "supported" | "unsupported">(
    "all"
  );
  const categories = useMemo(
    () => [...new Set(items.map((item) => item.category))].sort(),
    [items]
  );
  const skills = useMemo(
    () => [...new Set(items.flatMap((item) => item.skillLabels))].sort(),
    [items]
  );
  const allergens = useMemo(
    () => [...new Set(items.flatMap((item) => item.allergenLabels))].sort(),
    [items]
  );
  const visibleItems = filterCatalogItems(items, {
    query,
    category,
    skill,
    allergen,
    storage,
    familiarity,
    skillCompatibility,
    preparationTimeBand
  });

  return (
    <>
      <div className="catalog-filters" role="search">
        <label>
          <span>Search foods</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            type="search"
            value={query}
          />
        </label>
        <label>
          <span>Category</span>
          <select
            onChange={(event) => setCategory(event.target.value)}
            value={category}
          >
            <option value="">All categories</option>
            {categories.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Skill</span>
          <select
            onChange={(event) => setSkill(event.target.value)}
            value={skill}
          >
            <option value="">All reviewed skills</option>
            {skills.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Allergen metadata</span>
          <select
            onChange={(event) => setAllergen(event.target.value)}
            value={allergen}
          >
            <option value="">All allergen records</option>
            {allergens.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Storage support</span>
          <select
            onChange={(event) =>
              setStorage(
                event.target.value as "all" | "supported" | "unsupported"
              )
            }
            value={storage}
          >
            <option value="all">All storage states</option>
            <option value="supported">Reviewed guidance</option>
            <option value="unsupported">Unavailable guidance</option>
          </select>
        </label>
        <label>
          <span>Familiarity</span>
          <select
            onChange={(event) =>
              setFamiliarity(
                event.target.value as "all" | "familiar" | "new" | "unknown"
              )
            }
            value={familiarity}
          >
            <option value="all">All familiarity states</option>
            <option value="familiar">Previously tried</option>
            <option value="new">Not tried</option>
            <option value="unknown">Not recorded</option>
          </select>
        </label>
        <label>
          <span>Skill compatibility</span>
          <select
            onChange={(event) =>
              setSkillCompatibility(
                event.target.value as
                  "all" | "compatible" | "not_confirmed" | "unknown"
              )
            }
            value={skillCompatibility}
          >
            <option value="all">All compatibility states</option>
            <option value="compatible">Observed skills match</option>
            <option value="not_confirmed">Required skill not confirmed</option>
            <option value="unknown">Profile unavailable</option>
          </select>
        </label>
        <label>
          <span>Preparation time</span>
          <select
            onChange={(event) =>
              setPreparationTimeBand(
                event.target.value as
                  | "all"
                  | "under_15_minutes"
                  | "15_to_30_minutes"
                  | "over_30_minutes"
              )
            }
            value={preparationTimeBand}
          >
            <option value="all">All preparation times</option>
            <option value="under_15_minutes">Under 15 minutes</option>
            <option value="15_to_30_minutes">15 to 30 minutes</option>
            <option value="over_30_minutes">Over 30 minutes</option>
          </select>
        </label>
      </div>

      <p className="catalog-results" role="status">
        {visibleItems.length} reviewed preparation
        {visibleItems.length === 1 ? "" : "s"}
      </p>

      {visibleItems.length === 0 ? (
        <div className="foundation-card">
          <p className="foundation-card__status">No matches</p>
          <h2>Try a broader catalog filter</h2>
        </div>
      ) : (
        <ul className="catalog-list">
          {visibleItems.map((item) => (
            <li key={item.slug}>
              <Link className="catalog-card" href={`/foods/${item.slug}`}>
                <span>
                  <strong>{item.preparationName}</strong>
                  <small>
                    {item.foodName} · {item.category}
                  </small>
                </span>
                <span className="catalog-card__support">
                  {item.storageSupport === "supported"
                    ? "Reviewed storage guidance"
                    : "Storage guidance unavailable"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
