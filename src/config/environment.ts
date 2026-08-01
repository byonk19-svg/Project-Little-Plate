const publicEnvironmentKeys = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
] as const;

type EnvironmentInput = Readonly<Record<string, string | undefined>>;

export type PublicEnvironment = {
  appUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  localMailUrl?: string;
};

export function readPublicEnvironment(
  environment: EnvironmentInput = process.env
): PublicEnvironment {
  const missingKeys = publicEnvironmentKeys.filter(
    (key) => !environment[key]?.trim()
  );

  if (missingKeys.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingKeys.join(", ")}`
    );
  }

  const appUrl = environment.NEXT_PUBLIC_APP_URL as string;
  const supabaseUrl = environment.NEXT_PUBLIC_SUPABASE_URL as string;
  const localMailUrl = environment.NEXT_PUBLIC_LOCAL_MAIL_URL?.trim();

  try {
    new URL(appUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL must be an absolute URL");
  }

  try {
    new URL(supabaseUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be an absolute URL");
  }

  if (localMailUrl) {
    try {
      const parsedLocalMailUrl = new URL(localMailUrl);
      const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(
        parsedLocalMailUrl.hostname
      );
      const isHttp = ["http:", "https:"].includes(parsedLocalMailUrl.protocol);
      const hasUnsafeParts =
        Boolean(parsedLocalMailUrl.username) ||
        Boolean(parsedLocalMailUrl.password) ||
        Boolean(parsedLocalMailUrl.search) ||
        Boolean(parsedLocalMailUrl.hash);

      if (!isLoopback || !isHttp || hasUnsafeParts) {
        throw new Error("unsafe local inbox URL");
      }
    } catch {
      throw new Error(
        "NEXT_PUBLIC_LOCAL_MAIL_URL must be an absolute loopback HTTP(S) URL without credentials, query, or fragment"
      );
    }
  }

  return {
    appUrl,
    supabaseUrl,
    supabasePublishableKey:
      environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
    localMailUrl: localMailUrl || undefined
  };
}
