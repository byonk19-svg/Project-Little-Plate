"use client";

import type { ButtonHTMLAttributes, MouseEvent } from "react";

export function ConfirmSubmitButton({
  confirmation,
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  confirmation: string;
}) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(confirmation)) {
      event.preventDefault();
    }
    onClick?.(event);
  }

  return <button {...props} onClick={handleClick} type="submit" />;
}
