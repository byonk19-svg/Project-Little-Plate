"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { editManualWeek } from "@/modules/meals/week-edit-actions";
import {
  initialWeekEditFormState,
  type WeekEditFormState
} from "@/modules/meals/week-edit-form-state";
import type { WeekEditOption } from "@/modules/meals/queries";

type WeekEditFormProps = {
  operation: string;
  label: string;
  expectedVersion: number;
  idempotencyKey: string;
  windowStart: string;
  fields?: Record<string, string>;
  options?: WeekEditOption[];
  compact?: boolean;
};

function SubmitButton({ label, compact }: { label: string; compact: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      className={compact ? "week-edit__button" : "primary-action"}
      disabled={pending}
      type="submit"
    >
      {pending ? "Updating..." : label}
    </button>
  );
}

export function WeekEditForm({
  operation,
  label,
  expectedVersion,
  idempotencyKey,
  windowStart,
  fields = {},
  options,
  compact = false
}: WeekEditFormProps) {
  const [state, action] = useActionState<WeekEditFormState, FormData>(
    editManualWeek,
    initialWeekEditFormState
  );

  return (
    <form action={action} className="week-edit">
      <input name="operation" type="hidden" value={operation} />
      <input name="expectedVersion" type="hidden" value={expectedVersion} />
      <input name="windowStart" type="hidden" value={windowStart} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}
      {options ? (
        <label>
          <span className="sr-only">Reviewed preparation for {label}</span>
          <select
            aria-label={`Reviewed preparation for ${label}`}
            name="preparationSlug"
            required
          >
            <option value="">Choose reviewed preparation</option>
            {options.map((option) => (
              <option
                key={option.preparationSlug}
                value={option.preparationSlug}
              >
                {option.preparationName} · {option.foodName}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {state.status === "error" ? (
        <p className="form-message form-message--error" role="alert">
          {state.message}
        </p>
      ) : null}
      <SubmitButton compact={compact} label={label} />
    </form>
  );
}
