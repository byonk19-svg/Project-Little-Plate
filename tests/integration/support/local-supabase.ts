import { execSync } from "node:child_process";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type LocalSupabaseStatus = {
  API_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
};

export function readLocalSupabaseStatus(): LocalSupabaseStatus {
  return JSON.parse(
    execSync("pnpm exec supabase status -o json", { encoding: "utf8" })
  ) as LocalSupabaseStatus;
}

export function authenticatedClient(
  status: LocalSupabaseStatus,
  accessToken: string
): SupabaseClient {
  return createClient(status.API_URL, status.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
}

export async function waitForAuth(status: LocalSupabaseStatus): Promise<void> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${status.API_URL}/auth/v1/health`, {
        headers: { apikey: status.ANON_KEY }
      });

      if (response.ok) {
        return;
      }
    } catch {
      // A reset can return just before Auth accepts connections.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Local Supabase Auth did not become ready");
}
