import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isJsonRecord } from "@/modules/meals/transport";

export type InventoryHealthItem = {
  batchId: string;
  lifecycleState: string;
  remainingPortions: number;
  ledgerPortions: number;
  projectionMatchesLedger: boolean;
  lastEventAt: string;
};

export type InventoryHealthResult =
  | { status: "ready"; items: InventoryHealthItem[] }
  | { status: "unavailable"; items: [] };

function parseItem(value: unknown): InventoryHealthItem | null {
  if (
    !isJsonRecord(value) ||
    typeof value.batch_id !== "string" ||
    typeof value.lifecycle_state !== "string" ||
    !Number.isSafeInteger(value.remaining_portions) ||
    !Number.isSafeInteger(value.ledger_portions) ||
    typeof value.projection_matches_ledger !== "boolean" ||
    typeof value.last_event_at !== "string"
  ) {
    return null;
  }
  return {
    batchId: value.batch_id,
    lifecycleState: value.lifecycle_state,
    remainingPortions: value.remaining_portions as number,
    ledgerPortions: value.ledger_portions as number,
    projectionMatchesLedger: value.projection_matches_ledger,
    lastEventAt: value.last_event_at
  };
}

export async function getInventoryHealth(): Promise<InventoryHealthResult> {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("get_inventory_health");
  if (
    result.error ||
    !isJsonRecord(result.data) ||
    result.data.status !== "ready" ||
    !Array.isArray(result.data.items)
  ) {
    return { status: "unavailable", items: [] };
  }
  const items = result.data.items.map(parseItem);
  return items.every((item) => item !== null)
    ? { status: "ready", items: items as InventoryHealthItem[] }
    : { status: "unavailable", items: [] };
}
