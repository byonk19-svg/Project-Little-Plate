import { NextResponse, type NextRequest } from "next/server";

import { readPublicEnvironment } from "@/config/environment";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const code = request.nextUrl.searchParams.get("code");
  const { appUrl } = readPublicEnvironment();
  const redirectTo = (path: string) => new URL(path, appUrl);

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  }

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims) {
    return NextResponse.redirect(redirectTo("/login?error=callback"));
  }

  const { error: bootstrapError } = await supabase.rpc("bootstrap_account");

  if (bootstrapError) {
    return NextResponse.redirect(redirectTo("/login?error=account-setup"));
  }

  const { data: babies, error: babyError } = await supabase
    .from("babies")
    .select("id")
    .eq("is_active", true)
    .limit(1);

  if (babyError) {
    return NextResponse.redirect(redirectTo("/login?error=account-setup"));
  }

  return NextResponse.redirect(
    redirectTo(babies.length > 0 ? "/today" : "/profile-setup")
  );
}
