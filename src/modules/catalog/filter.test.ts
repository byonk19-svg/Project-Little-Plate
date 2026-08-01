import { describe, expect, test } from "vitest";

import type { PublishedPreparationSummary } from "./queries";
import { filterCatalogItems } from "./filter";

const items: PublishedPreparationSummary[] = Array.from(
  { length: 60 },
  (_, index) => ({
    slug: `synthetic-${index}`,
    preparationName: `Synthetic preparation ${index}`,
    foodName: `Synthetic food ${index}`,
    category: index % 2 === 0 ? "fruit" : "vegetable",
    skillLabels: [index % 3 === 0 ? "Skill A" : "Skill B"],
    allergenLabels: [index % 5 === 0 ? "Allergen A" : "No allergen"],
    storageSupport: index % 4 === 0 ? "unsupported" : "supported",
    familiarity:
      index % 3 === 0 ? "familiar" : index % 3 === 1 ? "new" : "unknown",
    skillCompatibility: index % 2 === 0 ? "compatible" : "not_confirmed",
    preparationTimeBand:
      index % 3 === 0
        ? "under_15_minutes"
        : index % 3 === 1
          ? "15_to_30_minutes"
          : "over_30_minutes"
  })
);

describe("filterCatalogItems", () => {
  test("combines search and structured filters deterministically", () => {
    expect(
      filterCatalogItems(items, {
        query: "food 30",
        category: "fruit",
        skill: "Skill A",
        allergen: "Allergen A",
        storage: "supported",
        familiarity: "familiar",
        skillCompatibility: "compatible",
        preparationTimeBand: "under_15_minutes"
      }).map(({ slug }) => slug)
    ).toEqual(["synthetic-30"]);
  });

  test("filters a target-size synthetic catalog deterministically", () => {
    const result = filterCatalogItems(items, {
      query: "synthetic",
      category: "",
      skill: "",
      allergen: "",
      storage: "all",
      familiarity: "all",
      skillCompatibility: "all",
      preparationTimeBand: "all"
    });

    expect(result).toHaveLength(60);
    expect(result.map(({ slug }) => slug)).toEqual(
      items.map(({ slug }) => slug)
    );
  });
});
