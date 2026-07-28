import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isJsonRecord, type JsonRecord } from "@/modules/meals/transport";

export type RefrigeratedBatchPreview = {
  preparationName: string;
  storageLocation: "refrigerator";
  ruleProfileId: string;
  storageRuleId: string;
  contentRevisionId: string;
  reviewedDurationRangeHours: {
    minimum: number;
    maximum: number;
  };
  appliedDurationHours: number;
  guidance: string;
  reviewedAt: string;
  sourceTitle: string;
  sourceUrl: string;
  preparedOrOpenedAt: string;
  deadlineAt: string;
};

export type RefrigeratedBatchPreviewResult =
  | { status: "ready"; preview: RefrigeratedBatchPreview }
  | { status: "unsupported"; reason: string };

export type KitchenInventoryItem = {
  batchId: string;
  preparationId: string;
  contentRevisionId: string;
  preparationName: string;
  storageLocation: "refrigerator";
  remainingPortions: number;
  preparedOrOpenedAt: string;
  deadlineAt: string;
  storageStatus: "ready" | "use_today" | "expired";
  ruleProfileId: string;
  storageRuleId: string;
  appliedDurationHours: number;
  reviewedDurationRangeHours: {
    minimum: number;
    maximum: number;
  };
  guidance: string;
  reviewedAt: string;
  sourceTitle: string;
  sourceUrl: string;
};

export type KitchenInventoryResult =
  | {
      status: "ready";
      babyId: string;
      timeZone: string;
      items: KitchenInventoryItem[];
    }
  | { status: "unavailable"; reason: string; items: [] };

function requiredString(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value !== "" ? value : null;
}

function requiredInteger(record: JsonRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isSafeInteger(value)
    ? value
    : null;
}

function parseRange(
  value: unknown
): RefrigeratedBatchPreview["reviewedDurationRangeHours"] | null {
  if (!isJsonRecord(value)) {
    return null;
  }

  const minimum = requiredInteger(value, "minimum");
  const maximum = requiredInteger(value, "maximum");
  return minimum !== null &&
    maximum !== null &&
    minimum > 0 &&
    maximum >= minimum
    ? { minimum, maximum }
    : null;
}

function parsePreview(value: unknown): RefrigeratedBatchPreview | null {
  if (!isJsonRecord(value) || value.status !== "ready") {
    return null;
  }

  const preparationName = requiredString(value, "preparation_name");
  const ruleProfileId = requiredString(value, "rule_profile_id");
  const storageRuleId = requiredString(value, "storage_rule_id");
  const contentRevisionId = requiredString(value, "content_revision_id");
  const reviewedDurationRangeHours = parseRange(
    value.reviewed_duration_range_hours
  );
  const appliedDurationHours = requiredInteger(value, "applied_duration_hours");
  const guidance = requiredString(value, "guidance");
  const reviewedAt = requiredString(value, "reviewed_at");
  const sourceTitle = requiredString(value, "source_title");
  const sourceUrl = requiredString(value, "source_url");
  const preparedOrOpenedAt = requiredString(value, "prepared_or_opened_at");
  const deadlineAt = requiredString(value, "deadline_at");

  return preparationName &&
    value.storage_location === "refrigerator" &&
    ruleProfileId &&
    storageRuleId &&
    contentRevisionId &&
    reviewedDurationRangeHours &&
    appliedDurationHours !== null &&
    appliedDurationHours > 0 &&
    guidance &&
    reviewedAt &&
    sourceTitle &&
    sourceUrl &&
    preparedOrOpenedAt &&
    deadlineAt
    ? {
        preparationName,
        storageLocation: "refrigerator",
        ruleProfileId,
        storageRuleId,
        contentRevisionId,
        reviewedDurationRangeHours,
        appliedDurationHours,
        guidance,
        reviewedAt,
        sourceTitle,
        sourceUrl,
        preparedOrOpenedAt,
        deadlineAt
      }
    : null;
}

function parseInventoryItem(value: unknown): KitchenInventoryItem | null {
  if (!isJsonRecord(value)) {
    return null;
  }

  const batchId = requiredString(value, "batch_id");
  const preparationId = requiredString(value, "preparation_id");
  const contentRevisionId = requiredString(value, "content_revision_id");
  const preparationName = requiredString(value, "preparation_name");
  const remainingPortions = requiredInteger(value, "remaining_portions");
  const preparedOrOpenedAt = requiredString(value, "prepared_or_opened_at");
  const deadlineAt = requiredString(value, "deadline_at");
  const ruleProfileId = requiredString(value, "rule_profile_id");
  const storageRuleId = requiredString(value, "storage_rule_id");
  const appliedDurationHours = requiredInteger(value, "applied_duration_hours");
  const reviewedDurationRangeHours = parseRange(
    value.reviewed_duration_range_hours
  );
  const guidance = requiredString(value, "guidance");
  const reviewedAt = requiredString(value, "reviewed_at");
  const sourceTitle = requiredString(value, "source_title");
  const sourceUrl = requiredString(value, "source_url");
  const storageStatus = value.storage_status;

  return batchId &&
    preparationId &&
    contentRevisionId &&
    preparationName &&
    value.storage_location === "refrigerator" &&
    remainingPortions !== null &&
    remainingPortions >= 0 &&
    preparedOrOpenedAt &&
    deadlineAt &&
    (storageStatus === "ready" ||
      storageStatus === "use_today" ||
      storageStatus === "expired") &&
    ruleProfileId &&
    storageRuleId &&
    appliedDurationHours !== null &&
    appliedDurationHours > 0 &&
    reviewedDurationRangeHours &&
    guidance &&
    reviewedAt &&
    sourceTitle &&
    sourceUrl
    ? {
        batchId,
        preparationId,
        contentRevisionId,
        preparationName,
        storageLocation: "refrigerator",
        remainingPortions,
        preparedOrOpenedAt,
        deadlineAt,
        storageStatus,
        ruleProfileId,
        storageRuleId,
        appliedDurationHours,
        reviewedDurationRangeHours,
        guidance,
        reviewedAt,
        sourceTitle,
        sourceUrl
      }
    : null;
}

export async function getRefrigeratedBatchPreview(
  mealComponentId: string,
  preparedOrOpenedAt = new Date().toISOString()
): Promise<RefrigeratedBatchPreviewResult> {
  const supabase = await createSupabaseServerClient();
  const referenceAt = new Date().toISOString();
  const { data, error } = await supabase.rpc("preview_refrigerated_batch", {
    p_meal_component_id: mealComponentId,
    p_prepared_or_opened_at: preparedOrOpenedAt,
    p_storage_location: "refrigerator",
    p_reference_at: referenceAt
  });
  const preview = error ? null : parsePreview(data);

  if (preview) {
    return { status: "ready", preview };
  }

  return {
    status: "unsupported",
    reason:
      !error &&
      isJsonRecord(data) &&
      data.status === "unsupported" &&
      typeof data.reason === "string"
        ? data.reason
        : "storage_rule_unavailable"
  };
}

export async function getKitchenInventory(): Promise<KitchenInventoryResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_kitchen_inventory", {
    p_reference_at: new Date().toISOString()
  });

  if (
    error ||
    !isJsonRecord(data) ||
    data.status !== "ready" ||
    !Array.isArray(data.items)
  ) {
    return {
      status: "unavailable",
      reason:
        !error && isJsonRecord(data) && typeof data.reason === "string"
          ? data.reason
          : "inventory_unavailable",
      items: []
    };
  }

  const babyId = requiredString(data, "baby_id");
  const timeZone = requiredString(data, "time_zone");
  const items = data.items.map(parseInventoryItem);

  return babyId && timeZone && items.every((item) => item !== null)
    ? {
        status: "ready",
        babyId,
        timeZone,
        items: items as KitchenInventoryItem[]
      }
    : {
        status: "unavailable",
        reason: "inventory_invalid",
        items: []
      };
}
