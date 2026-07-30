import type { Metadata } from "next";
import { cookies } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SIGN_OUT_COMPLETE_COOKIE } from "@/modules/profiles/session-marker";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in"
};

type LoginPageProps = {
  searchParams: Promise<{
    signedOut?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const supabase = await createSupabaseServerClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const deletionCompleted =
    cookieStore.get("little-plate-deletion-complete")?.value === "1";
  const signOutCompleted =
    params.signedOut === "1" &&
    cookieStore.get(SIGN_OUT_COMPLETE_COOKIE)?.value === "1" &&
    !claimsData?.claims;

  return (
    <article className="auth-page">
      <div>
        <p className="destination-page__eyebrow">Caregiver account</p>
        <h1>Sign in to Little Plate</h1>
        <p className="destination-page__lede">
          Enter your email and we’ll send a one-time sign-in link. No password
          to create or remember.
        </p>
      </div>

      <LoginForm />

      {signOutCompleted ? (
        <p className="form-message form-message--success" role="status">
          You’re signed out. Your household data is still here for your next
          sign-in.
        </p>
      ) : null}

      {deletionCompleted ? (
        <p className="form-message form-message--success" role="status">
          Your Little Plate account and active household records were deleted.
        </p>
      ) : null}

      <p className="privacy-note">
        Your household and baby profile stay private to your account.
      </p>
    </article>
  );
}
