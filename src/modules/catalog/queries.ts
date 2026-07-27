import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PublishedPreparationSummary = {
  slug: string;
  preparationName: string;
  foodName: string;
  storageSupport: "supported" | "unsupported";
};

export type PublishedPreparation = PublishedPreparationSummary & {
  category: string;
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

function parseSummary(value: unknown): PublishedPreparationSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const slug = readString(value, "slug");
  const preparationName = readString(value, "preparation_name");
  const foodName = readString(value, "food_name");
  const storageSupport = value.storage_support_status;

  if (
    !slug ||
    !preparationName ||
    !foodName ||
    (storageSupport !== "supported" && storageSupport !== "unsupported")
  ) {
    return null;
  }

  return { slug, preparationName, foodName, storageSupport };
}

export async function listPublishedPreparations(): Promise<CatalogListResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_published_preparations");

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

  const summary = parseSummary({
    ...data,
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
  const revisionId = readString(data, "revision_id");
  const method = readString(data, "method");
  const shapeTexture = readString(data, "shape_texture");
  const reviewerRole = readString(data, "reviewer_role");
  const reviewedAt = readString(data, "reviewed_at");
  const approvedAt = readString(data, "approved_at");
  const nextReviewAt = readString(data, "next_review_at");
  const category = readString(data, "category");

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
    !category ||
    tags.length === 0 ||
    tags.some((tag) => tag === null) ||
    storageRules.length === 0 ||
    storageRules.some((rule) => rule === null)
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
    category,
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
    storageRules: storageRules as PublishedPreparation["storageRules"]
  };
}
