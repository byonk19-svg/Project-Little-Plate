import { describe, expect, it } from "vitest";

import { readPublicEnvironment } from "./environment";

describe("readPublicEnvironment", () => {
  it("returns the typed public Supabase configuration", () => {
    expect(
      readPublicEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-publishable-key"
      })
    ).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "local-publishable-key"
    });
  });

  it("names every missing environment variable", () => {
    expect(() => readPublicEnvironment({})).toThrow(
      "Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  });

  it("rejects a malformed Supabase URL", () => {
    expect(() =>
      readPublicEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-publishable-key"
      })
    ).toThrow("NEXT_PUBLIC_SUPABASE_URL must be an absolute URL");
  });
});
