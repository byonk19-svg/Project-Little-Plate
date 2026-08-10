export type RecipeExtractionMethod =
  "json_ld" | "itemprop" | "metadata_preview";

export type RecipePreview = {
  sourceUrl: string;
  title: string;
  ingredients: string;
  instructions: string;
  notes: string;
  extractionMethod: RecipeExtractionMethod;
  missing: string[];
};

export type RecipeExtractionResult =
  | { status: "ready"; preview: RecipePreview }
  | { status: "incomplete"; preview: RecipePreview };

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripMarkup(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function text(value: unknown): string {
  return typeof value === "string" ? stripMarkup(value) : "";
}

function listText(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((entry) =>
        isRecord(entry) && typeof entry.text === "string"
          ? text(entry.text)
          : text(entry)
      )
      .filter(Boolean)
      .join("\n");
  }
  if (isRecord(value) && typeof value.text === "string") {
    return text(value.text);
  }
  return text(value);
}

function recipeType(value: unknown): boolean {
  return Array.isArray(value)
    ? value.some((entry) => entry === "Recipe")
    : value === "Recipe";
}

function findRecipe(value: unknown): RecordValue | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findRecipe(entry);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  if (recipeType(value["@type"])) return value;
  if (Array.isArray(value["@graph"])) return findRecipe(value["@graph"]);
  if (value.mainEntity) return findRecipe(value.mainEntity);
  return null;
}

function jsonLdRecipe(html: string): RecordValue | null {
  const scripts = html.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi
  );
  if (!scripts) return null;
  for (const script of scripts) {
    const body = script
      .replace(/^<[\s\S]*?>/, "")
      .replace(/<\/script>\s*$/i, "")
      .trim();
    try {
      const found = findRecipe(JSON.parse(body));
      if (found) return found;
    } catch {
      // Continue to the next structured block or fallback parser.
    }
  }
  return null;
}

function itemPropValues(html: string, property: string): string[] {
  const values: string[] = [];
  const pattern = new RegExp(
    `<([a-z0-9]+)[^>]*itemprop=["']${property}["'][^>]*>([\\s\\S]*?)</\\1\\s*>`,
    "gi"
  );
  for (const match of html.matchAll(pattern)) {
    const value = stripMarkup(match[2] ?? "");
    if (value) values.push(value);
  }
  const metaPattern = new RegExp(
    `<meta[^>]*itemprop=["']${property}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "gi"
  );
  for (const match of html.matchAll(metaPattern)) {
    const value = stripMarkup(match[1] ?? "");
    if (value) values.push(value);
  }
  return values;
}

function metadata(html: string, name: string): string {
  const pattern = new RegExp(
    `<meta[^>]*(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["'][^>]*>`,
    "i"
  );
  return stripMarkup(html.match(pattern)?.[1] ?? "");
}

function pageTitle(html: string): string {
  return stripMarkup(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
}

function result(
  sourceUrl: string,
  values: Pick<
    RecipePreview,
    "title" | "ingredients" | "instructions" | "notes"
  >,
  method: RecipeExtractionMethod
): RecipeExtractionResult {
  const preview: RecipePreview = {
    sourceUrl,
    ...values,
    extractionMethod: method,
    missing: [
      values.title ? null : "title",
      values.ingredients ? null : "ingredients",
      values.instructions ? null : "instructions"
    ].filter((value): value is string => value !== null)
  };
  return preview.missing.length === 0
    ? { status: "ready", preview }
    : { status: "incomplete", preview };
}

export function extractRecipeFromHtml(
  html: string,
  sourceUrl: string
): RecipeExtractionResult {
  const structured = jsonLdRecipe(html);
  if (structured) {
    return result(
      sourceUrl,
      {
        title: text(structured.name),
        ingredients: listText(structured.recipeIngredient),
        instructions: listText(structured.recipeInstructions),
        notes: text(structured.description)
      },
      "json_ld"
    );
  }

  const itempropTitle = itemPropValues(html, "name")[0] ?? "";
  const itempropIngredients = itemPropValues(html, "recipeIngredient").join(
    "\n"
  );
  const itempropInstructions = itemPropValues(html, "recipeInstructions").join(
    "\n"
  );
  if (itempropTitle || itempropIngredients || itempropInstructions) {
    return result(
      sourceUrl,
      {
        title: itempropTitle,
        ingredients: itempropIngredients,
        instructions: itempropInstructions,
        notes: ""
      },
      "itemprop"
    );
  }

  return result(
    sourceUrl,
    {
      title: pageTitle(html),
      ingredients: "",
      instructions: "",
      notes: metadata(html, "description")
    },
    "metadata_preview"
  );
}
