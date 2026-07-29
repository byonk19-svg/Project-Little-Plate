"use client";

import { useActionState } from "react";

import type { InventoryHealthItem } from "@/modules/storage/health-queries";
import { reconcileInventoryProjection } from "@/modules/storage/reconciliation-actions";
import { initialReconciliationFormState } from "@/modules/storage/reconciliation-form-state";

function ReconcileButton({ batchId }: { batchId: string }) {
  const [state, action, pending] = useActionState(
    reconcileInventoryProjection,
    initialReconciliationFormState
  );
  return (
    <form action={action}>
      <input name="batchId" type="hidden" value={batchId} />
      <button disabled={pending} type="submit">
        {pending ? "Refreshing..." : "Refresh inventory count"}
      </button>
      {state.status === "error" ? (
        <p className="form-message form-message--error" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function InventoryHealth({ items }: { items: InventoryHealthItem[] }) {
  const mismatches = items.filter((item) => !item.projectionMatchesLedger);
  return (
    <section className="foundation-card inventory-health">
      <p className="foundation-card__status">Inventory operations</p>
      <h2>Inventory record health</h2>
      <p>
        {mismatches.length === 0
          ? `${items.length} batch records match their append-only event history.`
          : `${mismatches.length} batch records need an inventory-count refresh.`}
      </p>
      {mismatches.map((item) => (
        <div key={item.batchId}>
          <p>
            Batch state: {item.lifecycleState}. Recorded count{" "}
            {item.remainingPortions}; event-history count {item.ledgerPortions}.
          </p>
          <ReconcileButton batchId={item.batchId} />
        </div>
      ))}
    </section>
  );
}
