export type RecipeInput = {
  title: string;
  description: string;
  ingredients: string;
  instructions: string;
  prepMinutes: string;
  cookMinutes: string;
  servings: string;
  notes: string;
  sourceUrl: string;
  sourceTitle: string;
  tags: string;
  favorite: boolean;
};

export type NormalizedRecipe = {
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
  tags: string[];
  favorite: boolean;
};

type RecipeErrors = Partial<Record<keyof RecipeInput, string>>;

export type RecipeNormalization =
  { ok: true; value: NormalizedRecipe } | { ok: false; errors: RecipeErrors };

const maxFieldLengths = {
  title: 160,
  description: 2000,
  ingredients: 12000,
  instructions: 20000,
  notes: 4000,
  sourceTitle: 240
} as const;

function clean(value: string): string {
  return value.trim();
}

const trackingParameterNames = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "_ga",
  "_hsenc",
  "_hsmi"
]);

export function normalizeRecipeSourceUrl(value: string): string {
  const url = new URL(value.trim());
  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";

  for (const key of [...url.searchParams.keys()]) {
    if (
      key.toLowerCase().startsWith("utm_") ||
      trackingParameterNames.has(key.toLowerCase())
    ) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
}

function parseOptionalWholeNumber(
  value: string,
  field: "prepMinutes" | "cookMinutes" | "servings",
  errors: RecipeErrors
): number | null {
  const normalized = clean(value);
  if (!normalized) {
    return null;
  }

  if (!/^\d+$/.test(normalized)) {
    errors[field] =
      field === "servings"
        ? "Use a whole number greater than zero."
        : "Use a whole number of minutes.";
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || (field === "servings" && parsed < 1)) {
    errors[field] =
      field === "servings"
        ? "Use a whole number greater than zero."
        : "Use a whole number of minutes.";
    return null;
  }

  return parsed;
}

function validateLength(
  value: string,
  field: keyof typeof maxFieldLengths,
  errors: RecipeErrors
): string {
  const normalized = clean(value);
  if (normalized.length > maxFieldLengths[field]) {
    errors[field] = `Keep this under ${maxFieldLengths[field]} characters.`;
  }
  return normalized;
}

export function parseRecipeTags(value: string): string[] {
  const unique = new Set<string>();
  for (const rawTag of value.split(",")) {
    const tag = rawTag
      .trim()
      .replace(/^['"]|['"]$/g, "")
      .trim()
      .toLowerCase();
    if (tag && tag.length <= 40) {
      unique.add(tag);
    }
    if (unique.size === 12) {
      break;
    }
  }
  return [...unique];
}

export function normalizeRecipeInput(input: RecipeInput): RecipeNormalization {
  const errors: RecipeErrors = {};
  const title = validateLength(input.title, "title", errors);
  const description = validateLength(input.description, "description", errors);
  const ingredients = validateLength(input.ingredients, "ingredients", errors);
  const instructions = validateLength(
    input.instructions,
    "instructions",
    errors
  );
  const notes = validateLength(input.notes, "notes", errors);
  const sourceTitle = validateLength(input.sourceTitle, "sourceTitle", errors);

  if (!title) {
    errors.title = "Add a recipe title.";
  }
  if (!ingredients) {
    errors.ingredients = "Add the recipe ingredients.";
  }
  if (!instructions) {
    errors.instructions = "Add the recipe instructions.";
  }

  const sourceUrl = clean(input.sourceUrl);
  if (sourceUrl) {
    try {
      const parsed = new URL(sourceUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("unsupported protocol");
      }
    } catch {
      errors.sourceUrl = "Use a valid http:// or https:// recipe link.";
    }
  }

  const prepMinutes = parseOptionalWholeNumber(
    input.prepMinutes,
    "prepMinutes",
    errors
  );
  const cookMinutes = parseOptionalWholeNumber(
    input.cookMinutes,
    "cookMinutes",
    errors
  );
  const servings = parseOptionalWholeNumber(input.servings, "servings", errors);

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      title,
      description: description || null,
      ingredients,
      instructions,
      prepMinutes,
      cookMinutes,
      servings,
      notes: notes || null,
      sourceUrl: sourceUrl || null,
      sourceTitle: sourceTitle || null,
      tags: parseRecipeTags(input.tags),
      favorite: input.favorite
    }
  };
}

export function recipeMatchesSearch(
  recipe:
    | Pick<NormalizedRecipe, "title" | "ingredients" | "tags">
    | {
        title: string;
        ingredients: string;
        tags: string[];
      },
  query: string
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return [recipe.title, recipe.ingredients, ...recipe.tags].some((value) =>
    value.toLowerCase().includes(normalizedQuery)
  );
}
