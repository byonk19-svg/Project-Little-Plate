import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  classifyHouseholdSession,
  type HouseholdSession
} from "@/modules/household/session";

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

export type HouseholdContext =
  | (Extract<HouseholdSession, { status: "authenticated" }> & {
      supabase: SupabaseServerClient;
    })
  | Extract<HouseholdSession, { status: "signed_out" | "unavailable" }>;

export async function getHouseholdContext(): Promise<HouseholdContext> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return { status: "signed_out" };

  const profile = await supabase
    .from("user_profiles")
    .select("household_id")
    .single();
  const session = classifyHouseholdSession({
    claimsPresent: true,
    profileHouseholdId: profile.data?.household_id
  });
  return session.status === "authenticated"
    ? { ...session, supabase }
    : session;
}
