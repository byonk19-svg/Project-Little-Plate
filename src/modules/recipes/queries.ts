import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getHouseholdContext } from "@/modules/household/server";
import { recipeMatchesSearch } from "@/modules/recipes/domain";

import { classifyRecipePageState, type RecipePageState } from "./page-state";

export type Recipe = {
  id: string;
  title: string;
  description: string | null;
  ingredients: string;
  instructions: string;
  prepMinutes: number | null;
  cookMinutes: number | null;
  servings: number | null;
  notes: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceType: "manual" | "imported";
  importStatus: "draft" | "confirmed";
  tags: string[];
  isFavorite: boolean;
  image: {
    src: string;
    altText: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type RecipeListResult =
  | { status: "ready"; recipes: Recipe[]; tags: string[] }
  | { status: "signed_out"; recipes: []; tags: [] }
  | { status: "unavailable"; recipes: []; tags: [] };

export type RecipePageResult =
  | { status: "ready"; recipe: Recipe }
  | { status: Exclude<RecipePageState, "ready"> };

type RecipeRow = {
  id: string;
  title: string;
  description: string | null;
  ingredients: string;
  instructions: string;
  prep_minutes: number | null;
  cook_minutes: number | null;
  servings: number | null;
  notes: string | null;
  source_url: string | null;
  source_title: string | null;
  source_type: "manual" | "imported";
  import_status: "draft" | "confirmed";
  tags: string[];
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
};

type RecipeImageRow = {
  recipe_id: string;
  storage_path: string | null;
  external_url: string | null;
  alt_text: string;
};

function mapRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    ingredients: row.ingredients,
    instructions: row.instructions,
    prepMinutes: row.prep_minutes,
    cookMinutes: row.cook_minutes,
    servings: row.servings,
    notes: row.notes,
    sourceUrl: row.source_url,
    sourceTitle: row.source_title,
    sourceType: row.source_type,
    importStatus: row.import_status,
    tags: Array.isArray(row.tags) ? row.tags : [],
    isFavorite: row.is_favorite,
    image: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getAuthenticatedClient() {
  const context = await getHouseholdContext();
  return context.status === "authenticated" ? context.supabase : null;
}

async function getRecipeListImages(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  recipeIds: string[]
): Promise<Map<string, Recipe["image"]>> {
  if (recipeIds.length === 0) return new Map();

  const result = await supabase
    .from("recipe_images")
    .select("recipe_id, storage_path, external_url, alt_text")
    .in("recipe_id", recipeIds);
  if (result.error || !result.data) return new Map();

  const entries = await Promise.all(
    (result.data as RecipeImageRow[]).map(async (image) => {
      let src = image.external_url;
      if (image.storage_path) {
        const signed = await supabase.storage
          .from("recipe-images")
          .createSignedUrl(image.storage_path, 60 * 10);
        src = signed.data?.signedUrl ?? null;
      }
      return src
        ? ([image.recipe_id, { src, altText: image.alt_text }] as const)
        : null;
    })
  );

  return new Map(
    entries.filter((entry): entry is NonNullable<typeof entry> =>
      Boolean(entry)
    )
  );
}

export async function getRecipes(
  options: {
    query?: string;
    favoriteOnly?: boolean;
    tag?: string;
  } = {}
): Promise<RecipeListResult> {
  const supabase = await getAuthenticatedClient();
  if (!supabase) {
    return { status: "signed_out", recipes: [], tags: [] };
  }

  const result = await supabase
    .from("recipes")
    .select(
      "id, title, description, ingredients, instructions, prep_minutes, cook_minutes, servings, notes, source_url, source_title, source_type, import_status, tags, is_favorite, created_at, updated_at"
    )
    .eq("import_status", "confirmed")
    .order("updated_at", { ascending: false });

  if (result.error || !result.data) {
    return { status: "unavailable", recipes: [], tags: [] };
  }

  const mappedRecipes = (result.data as RecipeRow[]).map(mapRecipe);
  const images = await getRecipeListImages(
    supabase,
    mappedRecipes.map((recipe) => recipe.id)
  );
  const recipes = mappedRecipes
    .map((recipe) => ({ ...recipe, image: images.get(recipe.id) ?? null }))
    .filter((recipe) => (options.favoriteOnly ? recipe.isFavorite : true))
    .filter((recipe) =>
      options.tag ? recipe.tags.includes(options.tag as string) : true
    )
    .filter((recipe) => recipeMatchesSearch(recipe, options.query ?? ""));

  const tags = [
    ...new Set((result.data as RecipeRow[]).flatMap((recipe) => recipe.tags))
  ].sort();

  return { status: "ready", recipes, tags };
}

export async function getRecipePageResult(
  recipeId: string
): Promise<RecipePageResult> {
  const context = await getHouseholdContext();
  const sessionStatus = context.status;
  if (sessionStatus !== "authenticated") {
    return { status: sessionStatus };
  }
  if (!/^[0-9a-f-]{36}$/i.test(recipeId)) {
    return { status: "not_found" };
  }

  const result = await context.supabase
    .from("recipes")
    .select(
      "id, title, description, ingredients, instructions, prep_minutes, cook_minutes, servings, notes, source_url, source_title, source_type, import_status, tags, is_favorite, created_at, updated_at"
    )
    .eq("id", recipeId)
    .eq("import_status", "confirmed")
    .maybeSingle();
  const status = classifyRecipePageState({
    sessionStatus,
    queryError: Boolean(result.error),
    recordFound: Boolean(result.data)
  });

  return status === "ready"
    ? { status, recipe: mapRecipe(result.data as RecipeRow) }
    : { status };
}

export function recipeSourceLabel(
  recipe: Pick<Recipe, "sourceType" | "sourceUrl">
): string {
  if (recipe.sourceType === "imported") {
    return recipe.sourceUrl
      ? "Imported recipe"
      : "Imported recipe without source link";
  }
  return "Manual recipe";
}
