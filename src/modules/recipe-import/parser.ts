import dns from "node:dns/promises";
import net from "node:net";

import type { RecipeImportMatch } from "@/modules/recipe-import/duplicates";

export type AddressResolver = (hostname: string) => Promise<string[]>;

export type RecipeImportDraft = {
  title: string;
  description: string;
  ingredients: string;
  instructions: string;
  prepMinutes: string;
  cookMinutes: string;
  servings: string;
  sourceUrl: string;
  sourceTitle: string;
  tags: string;
  suggestedImageUrl: string | null;
  existingMatches?: RecipeImportMatch[];
};

export type RecipeParseResult =
  | { ok: true; draft: RecipeImportDraft }
  | { ok: true; drafts: RecipeImportDraft[] }
  | { ok: false; reason: "recipe_data_not_found" | "recipe_data_invalid" };

const maxResponseBytes = 1_500_000;
const maxRedirects = 3;
const requestTimeoutMs = 8_000;

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (net.isIP(normalized) === 4) {
    const parts = normalized.split(".").map(Number);
    const [first, second] = parts;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 198 && (second === 18 || second === 19)) ||
      first >= 224
    );
  }

  if (net.isIP(normalized) === 6) {
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:192.168.") ||
      normalized.startsWith("::ffff:127.")
    );
  }

  return false;
}

const defaultAddressResolver: AddressResolver = async (hostname) => {
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  return addresses.map(({ address }) => address);
};

export async function normalizeRecipeImportUrl(
  value: string,
  resolveAddresses: AddressResolver = defaultAddressResolver
): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("Recipe imports require a valid http:// or https:// URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Recipe imports require a valid http:// or https:// URL");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Recipe import URLs cannot contain login credentials");
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    isPrivateAddress(hostname)
  ) {
    throw new Error("Recipe import URLs cannot target private destinations");
  }

  const addresses = await resolveAddresses(hostname);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new Error("Recipe import URLs cannot target private destinations");
  }

  parsed.hash = "";
  return parsed.toString();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripMarkup(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  ).trim();
}

function parseListItems(value: string, tag: "ul" | "ol"): string[] {
  const list = value.match(
    new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "i")
  );
  if (!list) return [];
  return [...list[0].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => stripMarkup(match[1]))
    .filter(Boolean);
}

function firstString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = firstString(item);
      if (candidate) return candidate;
    }
  }
  if (value && typeof value === "object" && "url" in value) {
    return firstString(value.url);
  }
  return null;
}

function parseDuration(value: unknown): string {
  if (typeof value !== "string") return "";
  const match = value.match(/^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!match) return "";
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const total = hours * 60 + minutes;
  return total > 0 ? String(total) : "";
}

function parseYield(value: unknown): string {
  const text = firstString(value);
  if (!text) return "";
  const match = text.match(/\d+/);
  return match ? match[0] : "";
}

function parseInstructions(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";
  return value
    .map((step) => {
      if (typeof step === "string") return step.trim();
      if (step && typeof step === "object" && "text" in step) {
        return firstString(step.text) ?? "";
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function asRecipeCandidates(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap(asRecipeCandidates);
  }
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record["@graph"])) {
    return record["@graph"].flatMap(asRecipeCandidates);
  }
  const type = record["@type"];
  const isRecipe =
    type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));
  return isRecipe ? [record] : [];
}

function extractJsonLd(html: string): Record<string, unknown>[] {
  const candidates: Record<string, unknown>[] = [];
  const scriptPattern =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    try {
      candidates.push(
        ...asRecipeCandidates(JSON.parse(decodeHtmlEntities(match[1])))
      );
    } catch {
      // A malformed block should not stop another valid JSON-LD block from working.
    }
  }
  return candidates;
}

function joinTags(...values: unknown[]): string {
  const tags = values
    .flatMap((value) => {
      if (Array.isArray(value)) return value;
      return typeof value === "string" ? value.split(",") : [];
    })
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(tags)].slice(0, 12).join(", ");
}

function sourceDetails(sourceUrl: string): {
  sourceTitle: string;
  sourceUrl: string;
} {
  let sourceTitle = "source website";
  try {
    sourceTitle = new URL(sourceUrl).hostname;
  } catch {
    // The fetch boundary already validated this URL.
  }
  return { sourceTitle, sourceUrl };
}

function imageSuggestion(recipe: Record<string, unknown>, sourceUrl: string) {
  const image = firstString(recipe.image);
  if (!image) return null;
  try {
    const parsedImage = new URL(image, sourceUrl);
    return parsedImage.protocol === "http:" || parsedImage.protocol === "https:"
      ? parsedImage.toString()
      : null;
  } catch {
    return null;
  }
}

function draftFromJsonLd(
  recipe: Record<string, unknown>,
  sourceUrl: string
): RecipeImportDraft | null {
  const title = firstString(recipe.name);
  const ingredients = Array.isArray(recipe.recipeIngredient)
    ? recipe.recipeIngredient
        .map(String)
        .map((item) => item.trim())
        .filter(Boolean)
        .join("\n")
    : (firstString(recipe.recipeIngredient) ?? "");
  const instructions = parseInstructions(recipe.recipeInstructions);
  if (!title || !ingredients || !instructions) return null;

  return {
    title,
    description: firstString(recipe.description) ?? "",
    ingredients,
    instructions,
    prepMinutes: parseDuration(recipe.prepTime),
    cookMinutes: parseDuration(recipe.cookTime),
    servings: parseYield(recipe.recipeYield),
    ...sourceDetails(sourceUrl),
    tags: joinTags(recipe.recipeCategory, recipe.keywords),
    suggestedImageUrl: imageSuggestion(recipe, sourceUrl)
  };
}

function extractArticleDrafts(
  html: string,
  sourceUrl: string
): RecipeImportDraft[] {
  const headings = [...html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)];
  const source = sourceDetails(sourceUrl);
  const drafts: RecipeImportDraft[] = [];

  headings.forEach((heading, index) => {
    const headingEnd = (heading.index ?? 0) + heading[0].length;
    const nextHeading = headings[index + 1]?.index ?? html.length;
    const section = html.slice(headingEnd, nextHeading);
    const ingredientsMarker = section.search(
      /(?:you(?:'|’|&apos;)ll\s+need|ingredients?)\s*:?/i
    );
    const instructionsMarker = section.search(/steps?\s*:?/i);
    if (
      ingredientsMarker < 0 ||
      instructionsMarker < 0 ||
      instructionsMarker <= ingredientsMarker
    ) {
      return;
    }

    const ingredients = parseListItems(
      section.slice(ingredientsMarker, instructionsMarker),
      "ul"
    );
    const instructions = parseListItems(
      section.slice(instructionsMarker),
      "ol"
    );
    if (ingredients.length === 0 || instructions.length === 0) return;

    const description =
      [
        ...section
          .slice(0, ingredientsMarker)
          .matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)
      ]
        .map((match) => stripMarkup(match[1]))
        .filter(Boolean)
        .at(-1) ?? "";

    drafts.push({
      title: stripMarkup(heading[1]),
      description,
      ingredients: ingredients.join("\n"),
      instructions: instructions.join("\n"),
      prepMinutes: "",
      cookMinutes: "",
      servings: "",
      ...source,
      tags: "",
      suggestedImageUrl: null
    });
  });

  return drafts.filter((draft) => draft.title);
}

export function parseRecipePage(
  html: string,
  sourceUrl: string
): RecipeParseResult {
  const jsonLdRecipes = extractJsonLd(html);
  const jsonLdDrafts = jsonLdRecipes
    .map((recipe) => draftFromJsonLd(recipe, sourceUrl))
    .filter((draft): draft is RecipeImportDraft => draft !== null);
  if (jsonLdDrafts.length === 1) return { ok: true, draft: jsonLdDrafts[0] };
  if (jsonLdDrafts.length > 1) return { ok: true, drafts: jsonLdDrafts };
  if (jsonLdRecipes.length > 0) {
    return { ok: false, reason: "recipe_data_invalid" };
  }

  const articleDrafts = extractArticleDrafts(html, sourceUrl);
  if (articleDrafts.length === 1) return { ok: true, draft: articleDrafts[0] };
  if (articleDrafts.length > 1) return { ok: true, drafts: articleDrafts };
  return { ok: false, reason: "recipe_data_not_found" };
}

export async function fetchRecipePage(
  sourceUrl: string
): Promise<RecipeParseResult> {
  let currentUrl = await normalizeRecipeImportUrl(sourceUrl);

  for (
    let redirectCount = 0;
    redirectCount <= maxRedirects;
    redirectCount += 1
  ) {
    const response = await fetch(currentUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        accept: "text/html, application/xhtml+xml",
        "user-agent": "LittlePlateRecipeImporter/1.0"
      },
      signal: AbortSignal.timeout(requestTimeoutMs)
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === maxRedirects) {
        throw new Error("The recipe website redirected too many times.");
      }
      currentUrl = await normalizeRecipeImportUrl(
        new URL(location, currentUrl).toString()
      );
      continue;
    }

    if (!response.ok) {
      throw new Error("The recipe website could not be read.");
    }
    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml")
    ) {
      throw new Error("That link does not point to an HTML recipe page.");
    }
    if (contentLength > maxResponseBytes) {
      throw new Error("The recipe page is too large to import.");
    }

    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > maxResponseBytes) {
      throw new Error("The recipe page is too large to import.");
    }
    return parseRecipePage(body, currentUrl);
  }

  throw new Error("The recipe website could not be read.");
}
