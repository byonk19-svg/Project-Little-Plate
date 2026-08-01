"use client";

import { useActionState, useState } from "react";

import { deleteCaregiverAccount } from "@/modules/profiles/account-deletion-actions";
import { initialAccountDeletionFormState } from "@/modules/profiles/account-deletion-form-state";

export function AccountDeletionForm() {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [state, formAction, isPending] = useActionState(
    deleteCaregiverAccount,
    initialAccountDeletionFormState
  );

  return (
    <form action={formAction} className="account-deletion-form">
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <label className="field">
        <span>Type &quot;DELETE&quot; to confirm</span>
        <input
          autoComplete="off"
          name="confirmation"
          required
          spellCheck={false}
        />
      </label>
      <label className="checkbox-field">
        <input name="understood" type="checkbox" value="yes" />
        <span>I understand this cannot be undone</span>
      </label>
      <button
        className="primary-action primary-action--danger"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Deleting account…" : "Delete my account"}
      </button>
      {state.message ? (
        <p className="form-message form-message--error" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
