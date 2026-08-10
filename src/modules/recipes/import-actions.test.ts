import { describe, expect, test, vi } from "vitest";

import { fetchRecipePreview } from "@/modules/recipes/import-actions";

function response(body: string, headers: Record<string, string> = {}) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", ...headers }
  });
}

describe("recipe link import", () => {
  test("rejects non-HTTPS and private URLs before fetching", async () => {
    const fetcher = vi.fn();
    await expect(
      fetchRecipePreview("http://example.com/recipe", fetcher)
    ).resolves.toMatchObject({ status: "error", code: "https_only" });
    await expect(
      fetchRecipePreview("https://127.0.0.1/recipe", fetcher)
    ).resolves.toMatchObject({ status: "error", code: "private_host" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("revalidates redirects and rejects a private destination", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://localhost/private" }
      })
    );
    await expect(
      fetchRecipePreview("https://example.com/recipe", fetcher)
    ).resolves.toMatchObject({ status: "error", code: "private_host" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test("rejects oversized and non-HTML responses", async () => {
    const oversized = vi
      .fn()
      .mockResolvedValue(
        response("<html></html>", { "content-length": "1000001" })
      );
    await expect(
      fetchRecipePreview("https://example.com/recipe", oversized)
    ).resolves.toMatchObject({ status: "error", code: "response_too_large" });

    const json = vi.fn().mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    await expect(
      fetchRecipePreview("https://example.com/recipe", json)
    ).resolves.toMatchObject({ status: "error", code: "not_html" });
  });

  test("caps chunked HTML while it is still streaming", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(1_000_001));
            controller.close();
          }
        }),
        { status: 200, headers: { "content-type": "text/html" } }
      )
    );
    await expect(
      fetchRecipePreview("https://example.com/recipe", fetcher)
    ).resolves.toMatchObject({ status: "error", code: "response_too_large" });
  });

  test("returns an editable extraction preview without persisting", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        response(
          `<title>Banana oats</title><meta name="description" content="Mix."/>`
        )
      );
    await expect(
      fetchRecipePreview("https://example.com/recipe", fetcher)
    ).resolves.toMatchObject({
      status: "incomplete",
      preview: {
        sourceUrl: "https://example.com/recipe",
        title: "Banana oats",
        extractionMethod: "metadata_preview"
      }
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://example.com/recipe",
      expect.objectContaining({
        redirect: "manual",
        headers: expect.objectContaining({ accept: "text/html" })
      })
    );
  });
});
