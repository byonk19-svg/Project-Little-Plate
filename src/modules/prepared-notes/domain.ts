export type PreparedNoteStatus = "preparing" | "prepared" | "used" | "archived";

export type PreparedNoteInput = {
  status: string;
  portionCount: string;
  notes: string;
};

export type PreparedNoteValue = {
  status: PreparedNoteStatus;
  portionCount: number | null;
  notes: string | null;
};

const statuses = new Set<PreparedNoteStatus>([
  "preparing",
  "prepared",
  "used",
  "archived"
]);

export function normalizePreparedNote(
  input: PreparedNoteInput
): { ok: true; value: PreparedNoteValue } | { ok: false; message: string } {
  if (!statuses.has(input.status as PreparedNoteStatus)) {
    return { ok: false, message: "Choose a valid preparation status." };
  }

  const rawCount = input.portionCount.trim();
  let portionCount: number | null = null;
  if (rawCount) {
    if (!/^\d+$/.test(rawCount)) {
      return { ok: false, message: "Use a whole number from 0 to 1000." };
    }
    portionCount = Number(rawCount);
    if (!Number.isSafeInteger(portionCount) || portionCount > 1000) {
      return { ok: false, message: "Use a whole number from 0 to 1000." };
    }
  }

  const notes = input.notes.trim();
  if (notes.length > 4000) {
    return { ok: false, message: "Keep notes under 4000 characters." };
  }

  return {
    ok: true,
    value: {
      status: input.status as PreparedNoteStatus,
      portionCount,
      notes: notes || null
    }
  };
}
