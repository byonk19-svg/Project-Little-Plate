"use client";

import { useActionState } from "react";

import { signOut } from "@/modules/profiles/session-actions";
import { initialSessionFormState } from "@/modules/profiles/session-form-state";

export function SignOutForm() {
  const [state, formAction, isPending] = useActionState(
    signOut,
    initialSessionFormState
  );

  return (
    <form action={formAction}>
      <button className="secondary-action" disabled={isPending} type="submit">
        {isPending ? "Signing out…" : "Sign out"}
      </button>
      {state.message ? (
        <p className="form-message form-message--error" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
