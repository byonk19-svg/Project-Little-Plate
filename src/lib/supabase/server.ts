import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { readPublicEnvironment } from "@/config/environment";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const environment = readPublicEnvironment();

  return createServerClient(
    environment.supabaseUrl,
    environment.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot write cookies. Route handlers and Server
            // Actions handle the auth exchanges that need to persist them.
          }
        }
      }
    }
  );
}
