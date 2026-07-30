import type { Metadata } from "next";
import { cookies } from "next/headers";

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
  const deletionCompleted =
    cookieStore.get("little-plate-deletion-complete")?.value === "1";

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

      {params.signedOut === "1" ? (
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
