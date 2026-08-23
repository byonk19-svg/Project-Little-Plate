"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

export function PendingSubmitButton({
  children,
  disabled,
  pendingLabel = "Saving…",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingLabel?: React.ReactNode;
}) {
  const { pending } = useFormStatus();

  return (
    <button {...props} disabled={pending || disabled} type="submit">
      {pending ? pendingLabel : children}
    </button>
  );
}
