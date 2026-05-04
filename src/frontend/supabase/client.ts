import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl?.trim() || !supabaseAnonKey?.trim()) {
    console.warn("[Conci Supabase] Browser client unavailable:", {
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl?.trim() ? `set (${supabaseUrl.trim().length} chars)` : "MISSING or empty",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey?.trim()
        ? `set (${supabaseAnonKey.trim().length} chars)`
        : "MISSING or empty",
      hint: "Add both to .env.local and restart next dev so NEXT_PUBLIC_* are inlined.",
    });
    return null;
  }

  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl.trim(), supabaseAnonKey.trim());
  }

  return browserClient;
}
