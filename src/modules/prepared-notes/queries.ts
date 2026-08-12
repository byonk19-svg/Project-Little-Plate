import { getHouseholdContext } from "@/modules/household/server";

export type PreparedNote = {
  id: string;
  status: "preparing" | "prepared" | "used" | "archived";
  portionCount: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  recipe: { id: string; title: string };
};

export async function getPreparedNotes(): Promise<
  | { status: "ready"; notes: PreparedNote[] }
  | { status: "signed_out" | "unavailable"; notes: [] }
> {
  const context = await getHouseholdContext();
  if (context.status === "signed_out")
    return { status: "signed_out", notes: [] };
  if (context.status !== "authenticated")
    return { status: "unavailable", notes: [] };
  const { supabase } = context;

  const result = await supabase
    .from("prepared_notes")
    .select(
      "id, status, portion_count, notes, created_at, updated_at, recipe:recipes!prepared_notes_recipe_household_fk(id, title)"
    )
    .order("updated_at", { ascending: false });
  if (result.error) return { status: "unavailable", notes: [] };

  const notes = result.data.flatMap((row) => {
    const recipe = Array.isArray(row.recipe) ? row.recipe[0] : row.recipe;
    if (!recipe || typeof recipe !== "object") return [];
    const recipeRow = recipe as { id?: unknown; title?: unknown };
    if (
      typeof row.id !== "string" ||
      typeof recipeRow.id !== "string" ||
      typeof recipeRow.title !== "string"
    )
      return [];
    return [
      {
        id: row.id,
        status: row.status as PreparedNote["status"],
        portionCount:
          typeof row.portion_count === "number" ? row.portion_count : null,
        notes: typeof row.notes === "string" ? row.notes : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        recipe: { id: recipeRow.id, title: recipeRow.title }
      }
    ];
  });

  return { status: "ready", notes };
}
