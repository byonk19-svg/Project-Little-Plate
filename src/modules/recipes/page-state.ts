export type RecipePageState =
  "ready" | "signed_out" | "unavailable" | "not_found";

export function classifyRecipePageState(input: {
  sessionStatus: "authenticated" | "signed_out" | "unavailable";
  queryError: boolean;
  recordFound: boolean;
}): RecipePageState {
  if (input.sessionStatus === "signed_out") return "signed_out";
  if (input.sessionStatus === "unavailable" || input.queryError) {
    return "unavailable";
  }
  return input.recordFound ? "ready" : "not_found";
}
