import type { PublishedPreparationSummary } from "./queries";

export type CatalogFilters = {
  query: string;
  category: string;
  skill: string;
  allergen: string;
  storage: "all" | "supported" | "unsupported";
  familiarity: "all" | "familiar" | "new" | "unknown";
  skillCompatibility: "all" | "compatible" | "not_confirmed" | "unknown";
  preparationTimeBand:
    "all" | "under_15_minutes" | "15_to_30_minutes" | "over_30_minutes";
};

export function filterCatalogItems(
  items: PublishedPreparationSummary[],
  filters: CatalogFilters
) {
  const query = filters.query.trim().toLocaleLowerCase();

  return items.filter((item) => {
    if (
      query &&
      !`${item.foodName} ${item.preparationName}`
        .toLocaleLowerCase()
        .includes(query)
    ) {
      return false;
    }
    if (filters.category && item.category !== filters.category) return false;
    if (filters.skill && !item.skillLabels.includes(filters.skill))
      return false;
    if (filters.allergen && !item.allergenLabels.includes(filters.allergen)) {
      return false;
    }
    if (filters.storage !== "all" && item.storageSupport !== filters.storage) {
      return false;
    }
    if (
      filters.familiarity !== "all" &&
      item.familiarity !== filters.familiarity
    ) {
      return false;
    }
    if (
      filters.skillCompatibility !== "all" &&
      item.skillCompatibility !== filters.skillCompatibility
    ) {
      return false;
    }
    return (
      filters.preparationTimeBand === "all" ||
      item.preparationTimeBand === filters.preparationTimeBand
    );
  });
}
