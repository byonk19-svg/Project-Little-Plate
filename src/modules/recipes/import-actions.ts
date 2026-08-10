import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { validatePublicRecipeUrl } from "@/modules/recipes/domain";
import {
  extractRecipeFromHtml,
  type RecipeExtractionResult
} from "@/modules/recipes/extractor";

const MAX_RESPONSE_BYTES = 1_000_000;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

export type RecipeImportErrorCode =
  | "https_only"
  | "invalid_url"
  | "private_host"
  | "port_not_allowed"
  | "redirect_limit"
  | "response_too_large"
  | "not_html"
  | "fetch_failed";

export type RecipeImportResult =
  | { status: "error"; code: RecipeImportErrorCode; message: string }
  | RecipeExtractionResult;

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
type Resolver = (hostname: string) => Promise<string[]>;

function privateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  ) {
    return true;
  }
  if (isIP(address) !== 4) return false;
  const [first, second] = address.split(".").map(Number);
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

async function defaultResolver(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

function errorResult(code: RecipeImportErrorCode): RecipeImportResult {
  const messages: Record<RecipeImportErrorCode, string> = {
    https_only: "Paste a public HTTPS recipe link.",
    invalid_url: "That link is not a valid recipe URL.",
    private_host: "That recipe host is not available for import.",
    port_not_allowed:
      "Use a public HTTPS link without credentials or a custom port.",
    redirect_limit: "The recipe link redirected too many times.",
    response_too_large: "That page is too large to import safely.",
    not_html: "That link did not return an HTML recipe page.",
    fetch_failed:
      "The recipe page could not be fetched. You can save the link and enter the details manually."
  };
  return { status: "error", code, message: messages[code] };
}

async function assertPublicHost(
  url: URL,
  resolver: Resolver
): Promise<RecipeImportResult | null> {
  try {
    const addresses = await resolver(url.hostname);
    if (addresses.some(privateAddress)) {
      return errorResult("private_host");
    }
  } catch {
    return errorResult("fetch_failed");
  }
  return null;
}

export async function fetchRecipePreview(
  value: string,
  fetcher: Fetcher = fetch,
  resolver: Resolver = defaultResolver
): Promise<RecipeImportResult> {
  const initial = validatePublicRecipeUrl(value);
  if (!initial.valid) return errorResult(initial.reason);

  let currentUrl = new URL(initial.url);
  for (
    let redirectCount = 0;
    redirectCount <= MAX_REDIRECTS;
    redirectCount += 1
  ) {
    const hostError = await assertPublicHost(currentUrl, resolver);
    if (hostError) return hostError;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetcher(currentUrl.toString(), {
        redirect: "manual",
        credentials: "omit",
        signal: controller.signal,
        headers: { accept: "text/html" }
      });
    } catch {
      clearTimeout(timeout);
      return errorResult("fetch_failed");
    }
    try {
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirectCount === MAX_REDIRECTS) {
          return errorResult("redirect_limit");
        }
        const next = validatePublicRecipeUrl(
          new URL(location, currentUrl).toString()
        );
        if (!next.valid) return errorResult(next.reason);
        currentUrl = new URL(next.url);
        continue;
      }

      if (!response.ok) return errorResult("fetch_failed");
      const contentType =
        response.headers.get("content-type")?.toLowerCase() ?? "";
      if (contentType && !contentType.includes("text/html")) {
        return errorResult("not_html");
      }
      const contentLength = Number(
        response.headers.get("content-length") ?? "0"
      );
      if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_RESPONSE_BYTES
      ) {
        return errorResult("response_too_large");
      }
      const reader = response.body?.getReader();
      if (!reader) return errorResult("fetch_failed");
      const decoder = new TextDecoder();
      let bytesRead = 0;
      let html = "";
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) {
            html += decoder.decode();
            break;
          }
          bytesRead += chunk.value.byteLength;
          if (bytesRead > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            return errorResult("response_too_large");
          }
          html += decoder.decode(chunk.value, { stream: true });
        }
      } catch {
        return errorResult("fetch_failed");
      }
      return extractRecipeFromHtml(html, currentUrl.toString());
    } finally {
      clearTimeout(timeout);
    }
  }

  return errorResult("redirect_limit");
}
