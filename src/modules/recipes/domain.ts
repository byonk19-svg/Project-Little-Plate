export type RecipeSourceType = "manual" | "recipe_url";
export type RecipeExtractionMethod =
  "json_ld" | "itemprop" | "metadata_preview" | "manual";

export type PersonalRecipeDraft = {
  title: string;
  ingredients: string;
  instructions: string;
  notes: string;
  sourceUrl: string;
  sourceType: RecipeSourceType;
  extractionMethod: RecipeExtractionMethod;
};

export type NormalizedPersonalRecipe = Omit<
  PersonalRecipeDraft,
  "sourceUrl"
> & { sourceUrl: string | null };

type ValidationResult =
  | { status: "valid"; recipe: NormalizedPersonalRecipe }
  | {
      status: "invalid";
      errors: Partial<
        Record<"title" | "ingredients" | "instructions" | "sourceUrl", string>
      >;
    };

type RecipeErrors = Partial<
  Record<"title" | "ingredients" | "instructions" | "sourceUrl", string>
>;

type UrlValidation =
  | { valid: true; url: string }
  | {
      valid: false;
      reason:
        "https_only" | "invalid_url" | "private_host" | "port_not_allowed";
    };

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return false;
  }
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    isPrivateIpv4(normalized)
  );
}

export function validatePublicRecipeUrl(value: string): UrlValidation {
  const trimmed = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: "invalid_url" };
  }

  if (parsed.protocol !== "https:") {
    return { valid: false, reason: "https_only" };
  }
  if (!parsed.hostname || isPrivateHost(parsed.hostname)) {
    return { valid: false, reason: "private_host" };
  }
  if (parsed.username || parsed.password || parsed.port) {
    return { valid: false, reason: "port_not_allowed" };
  }

  return { valid: true, url: parsed.toString() };
}

export function normalizePersonalRecipeDraft(
  draft: PersonalRecipeDraft
): ValidationResult {
  const title = normalizeText(draft.title);
  const ingredients = normalizeText(draft.ingredients);
  const instructions = normalizeText(draft.instructions);
  const notes = normalizeText(draft.notes);
  const sourceUrl = normalizeText(draft.sourceUrl);
  const errors: RecipeErrors = {};

  if (!title) {
    errors.title = "Enter a recipe title.";
  }
  if (!ingredients) {
    errors.ingredients = "Enter ingredients or a food description.";
  }
  if (!instructions) {
    errors.instructions = "Enter recipe instructions or preparation notes.";
  }
  if (sourceUrl) {
    const sourceValidation = validatePublicRecipeUrl(sourceUrl);
    if (!sourceValidation.valid) {
      errors.sourceUrl = "Use a public HTTPS recipe URL without credentials.";
    }
  }

  if (Object.keys(errors).length > 0) {
    return { status: "invalid", errors };
  }

  return {
    status: "valid",
    recipe: {
      title,
      ingredients,
      instructions,
      notes,
      sourceUrl: sourceUrl || null,
      sourceType: draft.sourceType,
      extractionMethod: draft.extractionMethod
    }
  };
}
