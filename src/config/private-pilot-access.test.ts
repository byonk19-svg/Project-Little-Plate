import { describe, expect, it } from "vitest";

import {
  canAccessPrivatePilot,
  readClaimEmail,
  readPrivatePilotAccess
} from "./private-pilot-access";

describe("private pilot access", () => {
  it("leaves local development open when the allowlist is absent", () => {
    const access = readPrivatePilotAccess({});

    expect(access).toEqual({
      enabled: false,
      allowedEmails: [],
      configurationError: null
    });
    expect(canAccessPrivatePilot("anyone@example.com", access)).toBe(true);
  });

  it("fails closed in production when the allowlist is omitted", () => {
    const access = readPrivatePilotAccess({ NODE_ENV: "production" });

    expect(access).toEqual({
      enabled: true,
      allowedEmails: [],
      configurationError: "missing_allowlist"
    });
    expect(canAccessPrivatePilot("owner@example.com", access)).toBe(false);
  });

  it("matches configured tester emails case-insensitively and trims entries", () => {
    const access = readPrivatePilotAccess({
      PRIVATE_PILOT_ALLOWED_EMAILS:
        " owner@example.com, Tester@Example.com,owner@example.com "
    });

    expect(access).toEqual({
      enabled: true,
      allowedEmails: ["owner@example.com", "tester@example.com"],
      configurationError: null
    });
    expect(canAccessPrivatePilot("TESTER@example.com", access)).toBe(true);
    expect(canAccessPrivatePilot("outside@example.com", access)).toBe(false);
  });

  it("fails closed when a deployment explicitly configures an empty allowlist", () => {
    const access = readPrivatePilotAccess({
      PRIVATE_PILOT_ALLOWED_EMAILS: "   "
    });

    expect(access).toEqual({
      enabled: true,
      allowedEmails: [],
      configurationError: null
    });
    expect(canAccessPrivatePilot("owner@example.com", access)).toBe(false);
  });

  it("fails closed for malformed configured entries", () => {
    const access = readPrivatePilotAccess({
      PRIVATE_PILOT_ALLOWED_EMAILS: "owner@example.com,not-an-email"
    });

    expect(access).toEqual({
      enabled: true,
      allowedEmails: [],
      configurationError: "invalid_email"
    });
    expect(canAccessPrivatePilot("owner@example.com", access)).toBe(false);
  });

  it("fails closed for malformed allowlist segments", () => {
    const malformedAllowlists = [
      "owner@example.com,not-an-email",
      "owner@example.com,broken@address@example.com",
      "owner@example.com,",
      ",owner@example.com",
      "owner@example.com,,tester@example.com",
      "owner@example.com,   ,tester@example.com"
    ];

    for (const raw of malformedAllowlists) {
      const access = readPrivatePilotAccess({
        PRIVATE_PILOT_ALLOWED_EMAILS: raw
      });

      expect(access.configurationError).toBe("invalid_email");
      expect(canAccessPrivatePilot("owner@example.com", access)).toBe(false);
    }
  });

  it("rejects signed-out and non-allowlisted testers when private mode is enabled", () => {
    const access = readPrivatePilotAccess({
      PRIVATE_PILOT_ALLOWED_EMAILS: "owner@example.com"
    });

    expect(canAccessPrivatePilot(null, access)).toBe(false);
    expect(canAccessPrivatePilot(undefined, access)).toBe(false);
    expect(canAccessPrivatePilot("tester@example.com", access)).toBe(false);
  });

  it("reads only a string email claim", () => {
    expect(readClaimEmail({ email: "owner@example.com" })).toBe(
      "owner@example.com"
    );
    expect(readClaimEmail({ email: 42 })).toBeNull();
    expect(readClaimEmail(null)).toBeNull();
  });
});
