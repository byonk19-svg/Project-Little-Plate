"use client";

import { useActionState } from "react";

import { requestSignInLink } from "@/modules/profiles/actions";
import { initialFormState } from "@/modules/profiles/form-state";

type LoginFormProps = {
  localMailUrl?: string;
};

export function LoginForm({ localMailUrl }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(
    requestSignInLink,
    initialFormState
  );

  return (
    <form action={formAction} className="profile-form">
      <label className="field">
        <span>Email address</span>
        <input
          autoComplete="email"
          inputMode="email"
          name="email"
          required
          type="email"
        />
      </label>

      <button className="primary-action" disabled={isPending} type="submit">
        {isPending ? "Sending…" : "Email me a sign-in link"}
      </button>

      {state.message ? (
        <p
          className={`form-message form-message--${state.status}`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.status === "success" ? (
            <>
              <strong>Check your email.</strong> {state.message}
              {localMailUrl ? (
                <>
                  {" "}
                  Local development captured the one-time link.{" "}
                  <a href={localMailUrl} rel="noreferrer" target="_blank">
                    Open local inbox
                  </a>
                  .
                </>
              ) : null}
            </>
          ) : (
            state.message
          )}
        </p>
      ) : null}
    </form>
  );
}
