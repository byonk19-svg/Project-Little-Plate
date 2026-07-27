import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in"
};

export default function LoginPage() {
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

      <p className="privacy-note">
        Your household and baby profile stay private to your account.
      </p>
    </article>
  );
}
