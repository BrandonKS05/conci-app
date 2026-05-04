import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serverClient: SupabaseClient | null = null;
let loggedMissingEnv = false;

function logMissingEnvOnce(url: string | undefined, anonKey: string | undefined) {
  if (loggedMissingEnv) return;
  loggedMissingEnv = true;
  const urlOk = Boolean(url?.trim());
  const keyOk = Boolean(anonKey?.trim());
  console.error(
    "[Conci Supabase] Server client cannot start — env check (restart `next dev` after editing .env.local):",
    {
      NEXT_PUBLIC_SUPABASE_URL: urlOk ? `set (${url!.trim().length} chars)` : "MISSING or empty",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: keyOk ? `set (${anonKey!.trim().length} chars)` : "MISSING or empty",
      hint: "Add both from Supabase → Project Settings → API (Project URL + anon public key).",
    }
  );
}

export function getSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl?.trim() || !supabaseAnonKey?.trim()) {
    logMissingEnvOnce(supabaseUrl, supabaseAnonKey);
    return null;
  }

  if (!serverClient) {
    serverClient = createClient(supabaseUrl.trim(), supabaseAnonKey.trim(), {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return serverClient;
}

