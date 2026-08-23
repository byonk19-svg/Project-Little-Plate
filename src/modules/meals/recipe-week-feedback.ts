export type RecipeWeekAction =
  "plan" | "complete" | "skip" | "replan" | "remove";

export type RecipeWeekActionQueryKey =
  "planned" | "completed" | "skipped" | "replanned" | "removed" | "error";

export function weekActionQueryKey(
  action: RecipeWeekAction,
  failed: boolean
): RecipeWeekActionQueryKey {
  if (failed) return "error";
  const actionToQuery = {
    plan: "planned",
    complete: "completed",
    skip: "skipped",
    replan: "replanned",
    remove: "removed"
  } satisfies Record<RecipeWeekAction, RecipeWeekActionQueryKey>;
  return actionToQuery[action];
}
