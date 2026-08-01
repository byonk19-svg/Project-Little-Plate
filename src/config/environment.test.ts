import { describe, expect, it } from "vitest";

import { readPublicEnvironment } from "./environment";

describe("readPublicEnvironment", () => {
  it("returns the typed public Supabase configuration", () => {
    expect(
      readPublicEnvironment({
        NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-publishable-key"
      })
    ).toEqual({
      appUrl: "http://127.0.0.1:3000",
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "local-publishable-key",
      localMailUrl: undefined
    });
  });

  it.each([
    "http://localhost:8025",
    "https://localhost/inbox",
    "http://127.0.0.1:56324",
    "https://[::1]:8025"
  ])("accepts the explicit loopback local inbox URL %s", (localMailUrl) => {
    expect(
      readPublicEnvironment({
        NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-publishable-key",
        NEXT_PUBLIC_LOCAL_MAIL_URL: localMailUrl
      }).localMailUrl
    ).toBe(localMailUrl);
  });

  it.each([
    "https://mail.example.test",
    "http://user:password@localhost:8025",
    "ftp://localhost:8025",
    "http://localhost:8025?email=caregiver@example.test",
    "http://localhost:8025/#token",
    "not-a-url"
  ])("rejects the unsafe local inbox URL %s", (localMailUrl) => {
    expect(() =>
      readPublicEnvironment({
        NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-publishable-key",
        NEXT_PUBLIC_LOCAL_MAIL_URL: localMailUrl
      })
    ).toThrow(
      "NEXT_PUBLIC_LOCAL_MAIL_URL must be an absolute loopback HTTP(S) URL without credentials, query, or fragment"
    );
  });

  it("names every missing environment variable", () => {
    expect(() => readPublicEnvironment({})).toThrow(
      "Missing required environment variables: NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  });

  it("rejects a malformed Supabase URL", () => {
    expect(() =>
      readPublicEnvironment({
        NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-publishable-key"
      })
    ).toThrow("NEXT_PUBLIC_SUPABASE_URL must be an absolute URL");
  });

  it("rejects a malformed application URL", () => {
    expect(() =>
      readPublicEnvironment({
        NEXT_PUBLIC_APP_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-publishable-key"
      })
    ).toThrow("NEXT_PUBLIC_APP_URL must be an absolute URL");
  });
});
