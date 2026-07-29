import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PlannerGenerationMetadataResult =
  | {
      status: "ready" | "stale";
      planId: string;
      windowStart: string;
      version: number;
      generatedAt: string;
      reproducibilityHash: string;
      messages: string[];
    }
  | { status: "none"; messages: [] };

export async function getPlannerGenerationMetadata(): Promise<PlannerGenerationMetadataResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_planner_generation_metadata");
  if (
    error ||
    typeof data !== "object" ||
    data === null ||
    Array.isArray(data) ||
    !["ready", "stale"].includes(
      String((data as Record<string, unknown>).status)
    )
  ) {
    return { status: "none", messages: [] };
  }
  const record = data as Record<string, unknown>;
  const status = record.status as "ready" | "stale";
  const explanations = record.explanations;
  const planId = record.plan_id;
  const windowStart = record.window_start;
  const version = record.version;
  const generatedAt = record.generated_at;
  const reproducibilityHash = record.reproducibility_hash;
  if (
    typeof planId !== "string" ||
    typeof windowStart !== "string" ||
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    typeof generatedAt !== "string" ||
    typeof reproducibilityHash !== "string" ||
    typeof explanations !== "object" ||
    explanations === null ||
    Array.isArray(explanations)
  ) {
    return { status: "none", messages: [] };
  }
  const meals = (explanations as Record<string, unknown>).meals;
  const messages = Array.isArray(meals)
    ? [
        ...new Set(
          meals.flatMap((meal) => {
            if (
              typeof meal !== "object" ||
              meal === null ||
              Array.isArray(meal) ||
              !Array.isArray((meal as Record<string, unknown>).components)
            ) {
              return [];
            }
            return (
              (meal as Record<string, unknown>).components as unknown[]
            ).flatMap((component) => {
              if (
                typeof component !== "object" ||
                component === null ||
                Array.isArray(component) ||
                !Array.isArray((component as Record<string, unknown>).messages)
              ) {
                return [];
              }
              return (
                (component as Record<string, unknown>).messages as unknown[]
              ).filter(
                (message): message is string =>
                  typeof message === "string" && message !== ""
              );
            });
          })
        )
      ]
    : [];
  return {
    status,
    planId,
    windowStart,
    version,
    generatedAt,
    reproducibilityHash,
    messages
  };
}
