"use client";

import type { ButtonHTMLAttributes, MouseEvent } from "react";
import { useFormStatus } from "react-dom";

export function ConfirmSubmitButton({
  children,
  confirmation,
  onClick,
  pendingLabel,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  confirmation: string;
  pendingLabel?: React.ReactNode;
}) {
  const { pending } = useFormStatus();

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(confirmation)) {
      event.preventDefault();
    }
    onClick?.(event);
  }

  return (
    <button
      {...props}
      disabled={pending || disabled}
      onClick={handleClick}
      type="submit"
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
