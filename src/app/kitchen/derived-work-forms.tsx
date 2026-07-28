"use client";

import { useActionState } from "react";

import {
  dismissPreparationTask,
  mutateManualGroceryItem,
  setDerivedGroceryState
} from "@/modules/derived/actions";
import { initialDerivedWorkFormState } from "@/modules/derived/form-state";

export function DismissPreparationTaskForm({
  idempotencyKey,
  preparationId,
  planVersion,
  taskFingerprint
}: {
  idempotencyKey: string;
  preparationId: string;
  planVersion: number;
  taskFingerprint: string;
}) {
  const [state, action, pending] = useActionState(
    dismissPreparationTask,
    initialDerivedWorkFormState
  );
  return (
    <form action={action}>
      <input name="preparationId" type="hidden" value={preparationId} />
      <input name="planVersion" type="hidden" value={planVersion} />
      <input name="taskFingerprint" type="hidden" value={taskFingerprint} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <button disabled={pending} type="submit">
        {pending ? "Hiding reminder…" : "Hide this reminder"}
      </button>
      {state.status === "error" ? <p role="alert">{state.message}</p> : null}
    </form>
  );
}

export function DerivedGroceryStateForm({
  alreadyHave,
  checked,
  foodId,
  idempotencyKey,
  mode
}: {
  alreadyHave: boolean;
  checked: boolean;
  foodId: string;
  idempotencyKey: string;
  mode: "alreadyHave" | "checked";
}) {
  const [state, action, pending] = useActionState(
    setDerivedGroceryState,
    initialDerivedWorkFormState
  );
  const operation = mode === "alreadyHave" ? "set_already_have" : "set_checked";
  const value = mode === "alreadyHave" ? !alreadyHave : !checked;
  const label =
    mode === "alreadyHave"
      ? alreadyHave
        ? "Move back to grocery needs"
        : "I already have this"
      : checked
        ? "Mark not checked"
        : "Check off";
  return (
    <form action={action}>
      <input name="foodId" type="hidden" value={foodId} />
      <input name="operation" type="hidden" value={operation} />
      <input name="value" type="hidden" value={String(value)} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <button disabled={pending} type="submit">
        {pending ? "Updating…" : label}
      </button>
      {state.status === "error" ? <p role="alert">{state.message}</p> : null}
    </form>
  );
}

export function AddManualGroceryItemForm({
  idempotencyKey
}: {
  idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState(
    mutateManualGroceryItem,
    initialDerivedWorkFormState
  );
  return (
    <form action={action} className="foundation-card">
      <h3>Add a manual grocery item</h3>
      <input name="operation" type="hidden" value="add" />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <label>
        Item
        <input maxLength={80} name="name" required />
      </label>
      <label>
        Store section
        <input maxLength={60} name="storeSection" required />
      </label>
      <label>
        Quantity (items)
        <input max={99} min={1} name="quantity" required type="number" />
      </label>
      <button disabled={pending} type="submit">
        {pending ? "Adding…" : "Add manual item"}
      </button>
      {state.status === "error" ? <p role="alert">{state.message}</p> : null}
    </form>
  );
}

export function ManualGroceryItemForms({
  checkIdempotencyKey,
  deleteIdempotencyKey,
  editIdempotencyKey,
  item
}: {
  checkIdempotencyKey: string;
  deleteIdempotencyKey: string;
  editIdempotencyKey: string;
  item: {
    id: string;
    name: string;
    storeSection: string;
    quantity: number;
    checked: boolean;
  };
}) {
  const [editState, editAction, editPending] = useActionState(
    mutateManualGroceryItem,
    initialDerivedWorkFormState
  );
  const [checkState, checkAction, checkPending] = useActionState(
    mutateManualGroceryItem,
    initialDerivedWorkFormState
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    mutateManualGroceryItem,
    initialDerivedWorkFormState
  );
  return (
    <div>
      <form action={editAction}>
        <input name="operation" type="hidden" value="edit" />
        <input name="itemId" type="hidden" value={item.id} />
        <input name="idempotencyKey" type="hidden" value={editIdempotencyKey} />
        <label>
          Item
          <input defaultValue={item.name} maxLength={80} name="name" required />
        </label>
        <label>
          Store section
          <input
            defaultValue={item.storeSection}
            maxLength={60}
            name="storeSection"
            required
          />
        </label>
        <label>
          Quantity (items)
          <input
            defaultValue={item.quantity}
            max={99}
            min={1}
            name="quantity"
            required
            type="number"
          />
        </label>
        <button disabled={editPending} type="submit">
          {editPending ? "Saving…" : "Save manual item"}
        </button>
        {editState.status === "error" ? (
          <p role="alert">{editState.message}</p>
        ) : null}
      </form>
      <form action={checkAction}>
        <input name="operation" type="hidden" value="check" />
        <input name="itemId" type="hidden" value={item.id} />
        <input name="checked" type="hidden" value={String(!item.checked)} />
        <input
          name="idempotencyKey"
          type="hidden"
          value={checkIdempotencyKey}
        />
        <button disabled={checkPending} type="submit">
          {checkPending
            ? "Updating…"
            : item.checked
              ? "Mark not checked"
              : "Check off"}
        </button>
        {checkState.status === "error" ? (
          <p role="alert">{checkState.message}</p>
        ) : null}
      </form>
      <form action={deleteAction}>
        <input name="operation" type="hidden" value="delete" />
        <input name="itemId" type="hidden" value={item.id} />
        <input
          name="idempotencyKey"
          type="hidden"
          value={deleteIdempotencyKey}
        />
        <button disabled={deletePending} type="submit">
          {deletePending ? "Deleting…" : "Delete manual item"}
        </button>
        {deleteState.status === "error" ? (
          <p role="alert">{deleteState.message}</p>
        ) : null}
      </form>
    </div>
  );
}
