import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isJsonRecord, type JsonRecord } from "@/modules/meals/transport";

export type ReactionReportContext = {
  servedEventId: string;
  foodId: string;
  foodName: string;
  guidanceRevisionId: string;
  guidance: string;
  sourceTitle: string;
  sourceUrl: string;
  reviewedAt: string;
};

export type ActiveReactionBlock = {
  foodId: string;
  foodName: string;
};

function requiredString(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value !== "" ? value : null;
}

export function parseReactionReportContext(
  value: unknown
): ReactionReportContext | null {
  if (!isJsonRecord(value) || value.status !== "ready") {
    return null;
  }

  const servedEventId = requiredString(value, "served_event_id");
  const foodId = requiredString(value, "food_id");
  const foodName = requiredString(value, "food_name");
  const guidanceRevisionId = requiredString(value, "guidance_revision_id");
  const guidance = requiredString(value, "guidance");
  const sourceTitle = requiredString(value, "source_title");
  const sourceUrl = requiredString(value, "source_url");
  const reviewedAt = requiredString(value, "reviewed_at");

  return servedEventId &&
    foodId &&
    foodName &&
    guidanceRevisionId &&
    guidance &&
    sourceTitle &&
    sourceUrl &&
    reviewedAt
    ? {
        servedEventId,
        foodId,
        foodName,
        guidanceRevisionId,
        guidance,
        sourceTitle,
        sourceUrl,
        reviewedAt
      }
    : null;
}

export function parseActiveReactionBlocks(
  value: unknown
): ActiveReactionBlock[] | null {
  if (
    !isJsonRecord(value) ||
    value.status !== "ready" ||
    !Array.isArray(value.items)
  ) {
    return null;
  }

  const items: ActiveReactionBlock[] = [];
  for (const item of value.items) {
    if (!isJsonRecord(item)) {
      return null;
    }

    const foodId = requiredString(item, "food_id");
    const foodName = requiredString(item, "food_name");
    if (!foodId || !foodName) {
      return null;
    }
    items.push({ foodId, foodName });
  }

  return items;
}

export async function getReactionReportContext(
  servedEventId: string | undefined
): Promise<ReactionReportContext | null> {
  if (!servedEventId) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_reaction_report_context", {
    p_served_event_id: servedEventId
  });

  return error ? null : parseReactionReportContext(data);
}

export async function getActiveReactionBlocks(): Promise<
  ActiveReactionBlock[] | null
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_active_reaction_blocks");

  return error ? null : parseActiveReactionBlocks(data);
}
