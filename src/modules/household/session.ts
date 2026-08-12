export type HouseholdSession =
  | { status: "authenticated"; householdId: string }
  | { status: "signed_out" }
  | { status: "unavailable" };

export function classifyHouseholdSession(input: {
  claimsPresent: boolean;
  profileHouseholdId: string | null | undefined;
}): HouseholdSession {
  if (!input.claimsPresent) return { status: "signed_out" };
  return input.profileHouseholdId
    ? { status: "authenticated", householdId: input.profileHouseholdId }
    : { status: "unavailable" };
}
