import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Best-effort display name for trip share copy (Supabase Auth user metadata). */
export async function fetchTripHostDisplayName(svc: SupabaseClient, ownerUserId: string | null): Promise<string> {
  if (!ownerUserId) return "Someone";
  const { data, error } = await svc.auth.admin.getUserById(ownerUserId);
  if (error || !data?.user) return "Someone";
  const meta = data.user.user_metadata as Record<string, unknown> | undefined;
  const full = typeof meta?.full_name === "string" ? meta.full_name.trim() : "";
  const name = typeof meta?.name === "string" ? meta.name.trim() : "";
  const emailLocal = data.user.email?.split("@")[0]?.trim() ?? "";
  return full || name || emailLocal || "Someone";
}
