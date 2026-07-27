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

  return {
    appUrl,
    supabaseUrl,
    supabasePublishableKey:
      environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string
  };
}
