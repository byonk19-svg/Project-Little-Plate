import { createSupabaseServerClient } from "@/lib/supabase/server";

type PublishedPreparationBase = {
  slug: string;
  preparationName: string;
  foodName: string;
  category: string;
  skillLabels: string[];
  allergenLabels: string[];
  storageSupport: "supported" | "unsupported";
  preparationTimeBand:
    "under_15_minutes" | "15_to_30_minutes" | "over_30_minutes";
};

export type PublishedPreparationSummary = PublishedPreparationBase & {
  familiarity: "familiar" | "new" | "unknown";
  skillCompatibility: "compatible" | "not_confirmed" | "unknown";
};

export type PublishedPreparation = PublishedPreparationBase & {
  revisionId: string;
  version: number;
  method: string;
  shapeTexture: string;
  reviewerRole: string;
  reviewedAt: string;
  approvedAt: string;
  nextReviewAt: string;
  source: {
    publisher: string;
    title: string;
    url: string;
    sourceDate: string;
    accessedAt: string;
  };
  tags: Array<{
    kind: "skill" | "allergen" | "category";
    label: string;
  }>;
  storageRules: Array<{
    supportStatus: "supported" | "unsupported";
    deadlineKind: "discard_after" | "quality_by" | "informational" | null;
    durationHours: number | null;
    guidance: string | null;
  }>;
  visuals: Array<{
    assetReference: string;
    rightsBasis: "original" | "licensed";
    rightsHolder: string;
    licenseName: string | null;
    licenseUrl: string | null;
    altText: string;
    reviewedAt: string;
  }>;
};

export type CatalogListResult =
  | { status: "ready"; items: PublishedPreparationSummary[] }
  | { status: "unavailable"; items: [] };

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: JsonRecord, key: string): string | null {
  return typeof record[key] === "string" && record[key] !== ""
    ? record[key]
    : null;
}

function parseBase(value: unknown): PublishedPreparationBase | null {
  if (!isRecord(value)) {
    return null;
  }

  const slug = readString(value, "slug");
  const preparationName = readString(value, "preparation_name");
  const foodName = readString(value, "food_name");
  const category = readString(value, "category");
  const skillLabels = value.skill_labels;
  const allergenLabels = value.allergen_labels;
  const storageSupport = value.storage_support_status;
  const preparationTimeBand = value.preparation_time_band;

  if (
    !slug ||
    !preparationName ||
    !foodName ||
    !category ||
    !Array.isArray(skillLabels) ||
    skillLabels.some((label) => typeof label !== "string" || label === "") ||
    !Array.isArray(allergenLabels) ||
    allergenLabels.some((label) => typeof label !== "string" || label === "") ||
    (storageSupport !== "supported" && storageSupport !== "unsupported") ||
    (preparationTimeBand !== "under_15_minutes" &&
      preparationTimeBand !== "15_to_30_minutes" &&
      preparationTimeBand !== "over_30_minutes")
  ) {
    return null;
  }

  return {
    slug,
    preparationName,
    foodName,
    category,
    skillLabels,
    allergenLabels,
    storageSupport,
    preparationTimeBand
  };
}

function parseSummary(value: unknown): PublishedPreparationSummary | null {
  const base = parseBase(value);
  if (!base || !isRecord(value)) {
    return null;
  }

  const familiarity = value.familiarity;
  const skillCompatibility = value.skill_compatibility;
  if (
    (familiarity !== "familiar" &&
      familiarity !== "new" &&
      familiarity !== "unknown") ||
    (skillCompatibility !== "compatible" &&
      skillCompatibility !== "not_confirmed" &&
      skillCompatibility !== "unknown")
  ) {
    return null;
  }

  return { ...base, familiarity, skillCompatibility };
}

export async function listPublishedPreparations(): Promise<CatalogListResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_published_catalog_items");

  if (error || !Array.isArray(data)) {
    return { status: "unavailable", items: [] };
  }

  const items = data.map(parseSummary);
  if (items.some((item) => item === null)) {
    return { status: "unavailable", items: [] };
  }

  return {
    status: "ready",
    items: items as PublishedPreparationSummary[]
  };
}

function parseTag(value: unknown): PublishedPreparation["tags"][number] | null {
  if (!isRecord(value)) {
    return null;
  }

  const kind = value.kind;
  const label = readString(value, "label");
  if (
    !label ||
    (kind !== "skill" && kind !== "allergen" && kind !== "category")
  ) {
    return null;
  }

  return { kind, label };
}

function parseStorageRule(
  value: unknown
): PublishedPreparation["storageRules"][number] | null {
  if (!isRecord(value)) {
    return null;
  }

  const supportStatus = value.support_status;
  const deadlineKind = value.deadline_kind;
  const durationHours = value.duration_hours;
  const guidance = value.guidance;

  if (
    (supportStatus !== "supported" && supportStatus !== "unsupported") ||
    (deadlineKind !== null &&
      deadlineKind !== "discard_after" &&
      deadlineKind !== "quality_by" &&
      deadlineKind !== "informational") ||
    (durationHours !== null &&
      (typeof durationHours !== "number" || durationHours < 0)) ||
    (guidance !== null && typeof guidance !== "string")
  ) {
    return null;
  }

  if (
    supportStatus === "unsupported" &&
    (deadlineKind !== null || durationHours !== null || guidance !== null)
  ) {
    return null;
  }

  return { supportStatus, deadlineKind, durationHours, guidance };
}

function parseVisual(
  value: unknown
): PublishedPreparation["visuals"][number] | null {
  if (!isRecord(value)) {
    return null;
  }

  const assetReference = readString(value, "asset_reference");
  const rightsBasis = value.rights_basis;
  const rightsHolder = readString(value, "rights_holder");
  const licenseName =
    value.license_name === null ? null : readString(value, "license_name");
  const licenseUrl =
    value.license_url === null ? null : readString(value, "license_url");
  const altText = readString(value, "alt_text");
  const reviewedAt = readString(value, "reviewed_at");
  const hasValidLicenseUrl = (() => {
    if (!licenseUrl) return false;

    try {
      const parsed = new URL(licenseUrl);
      return (
        parsed.protocol === "https:" &&
        parsed.hostname.length > 0 &&
        parsed.username === "" &&
        parsed.password === ""
      );
    } catch {
      return false;
    }
  })();

  if (
    !assetReference ||
    !/^\/[A-Za-z0-9]/.test(assetReference) ||
    (rightsBasis !== "original" && rightsBasis !== "licensed") ||
    !rightsHolder ||
    !altText ||
    !reviewedAt ||
    (rightsBasis === "licensed" && (!licenseName || !hasValidLicenseUrl)) ||
    (rightsBasis === "original" &&
      (licenseName !== null || licenseUrl !== null))
  ) {
    return null;
  }

  return {
    assetReference,
    rightsBasis,
    rightsHolder,
    licenseName,
    licenseUrl,
    altText,
    reviewedAt
  };
}

export async function getPublishedPreparation(
  slug: string
): Promise<PublishedPreparation | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_published_preparation", {
    p_slug: slug
  });

  if (error || !isRecord(data)) {
    return null;
  }

  const summary = parseBase({
    ...data,
    skill_labels: Array.isArray(data.tags)
      ? data.tags
          .filter((tag) => isRecord(tag) && tag.kind === "skill")
          .map((tag) => tag.label)
      : null,
    allergen_labels: Array.isArray(data.tags)
      ? data.tags
          .filter((tag) => isRecord(tag) && tag.kind === "allergen")
          .map((tag) => tag.label)
      : null,
    storage_support_status: Array.isArray(data.storage_rules)
      ? data.storage_rules.some(
          (rule) => isRecord(rule) && rule.support_status === "supported"
        )
        ? "supported"
        : "unsupported"
      : null
  });
  const source = data.source;
  const tags = Array.isArray(data.tags) ? data.tags.map(parseTag) : [];
  const storageRules = Array.isArray(data.storage_rules)
    ? data.storage_rules.map(parseStorageRule)
    : [];
  const visuals = Array.isArray(data.visuals)
    ? data.visuals.map(parseVisual)
    : [];
  const revisionId = readString(data, "revision_id");
  const method = readString(data, "method");
  const shapeTexture = readString(data, "shape_texture");
  const reviewerRole = readString(data, "reviewer_role");
  const reviewedAt = readString(data, "reviewed_at");
  const approvedAt = readString(data, "approved_at");
  const nextReviewAt = readString(data, "next_review_at");

  if (
    !summary ||
    !isRecord(source) ||
    !revisionId ||
    typeof data.version !== "number" ||
    !method ||
    !shapeTexture ||
    !reviewerRole ||
    !reviewedAt ||
    !approvedAt ||
    !nextReviewAt ||
    tags.length === 0 ||
    tags.some((tag) => tag === null) ||
    storageRules.length === 0 ||
    storageRules.some((rule) => rule === null) ||
    visuals.some((visual) => visual === null)
  ) {
    return null;
  }

  const publisher = readString(source, "publisher");
  const title = readString(source, "title");
  const url = readString(source, "url");
  const sourceDate = readString(source, "source_date");
  const accessedAt = readString(source, "accessed_at");

  if (!publisher || !title || !url || !sourceDate || !accessedAt) {
    return null;
  }

  return {
    ...summary,
    revisionId,
    version: data.version,
    method,
    shapeTexture,
    reviewerRole,
    reviewedAt,
    approvedAt,
    nextReviewAt,
    source: { publisher, title, url, sourceDate, accessedAt },
    tags: tags as PublishedPreparation["tags"],
    storageRules: storageRules as PublishedPreparation["storageRules"],
    visuals: visuals as PublishedPreparation["visuals"]
  };
}
