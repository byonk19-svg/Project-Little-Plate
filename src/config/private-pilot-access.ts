type EnvironmentInput = Readonly<Record<string, string | undefined>>;

export type PrivatePilotAccess = {
  enabled: boolean;
  allowedEmails: readonly string[];
  configurationError: "invalid_email" | "missing_allowlist" | null;
};

function normalizeEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();

  if (!/^[^@\s]+@[^@\s]+$/.test(normalized)) {
    return null;
  }

  return normalized;
}

export function readPrivatePilotAccess(
  environment: EnvironmentInput = process.env
): PrivatePilotAccess {
  const rawAllowlist = environment.PRIVATE_PILOT_ALLOWED_EMAILS;

  if (rawAllowlist === undefined) {
    if (environment.NODE_ENV === "production") {
      return {
        enabled: true,
        allowedEmails: [],
        configurationError: "missing_allowlist"
      };
    }

    return {
      enabled: false,
      allowedEmails: [],
      configurationError: null
    };
  }

  const entries = rawAllowlist.split(",").map((email) => email.trim());
  const explicitlyEmpty = rawAllowlist.trim().length === 0;
  const configuredEmails = entries
    .map(normalizeEmail)
    .filter((email): email is string => email !== null);

  const hasInvalidEmail =
    !explicitlyEmpty &&
    entries.some(
      (email) => email.length === 0 || normalizeEmail(email) === null
    );

  if (hasInvalidEmail) {
    return {
      enabled: true,
      allowedEmails: [],
      configurationError: "invalid_email"
    };
  }

  return {
    enabled: true,
    allowedEmails: [...new Set(configuredEmails)],
    configurationError: null
  };
}

export function canAccessPrivatePilot(
  email: string | null | undefined,
  access: PrivatePilotAccess
): boolean {
  if (!access.enabled) {
    return true;
  }

  if (access.configurationError !== null || !email) {
    return false;
  }

  const normalizedEmail = normalizeEmail(email);
  return (
    normalizedEmail !== null && access.allowedEmails.includes(normalizedEmail)
  );
}

export function readClaimEmail(claims: unknown): string | null {
  if (!claims || typeof claims !== "object") {
    return null;
  }

  const email = (claims as Record<string, unknown>).email;
  return typeof email === "string" ? email : null;
}
