import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAuthUserDisplayLabel } from "@/backend/trip-member-names";

/**
 * Best-effort display name for trip share copy.
 * Prefers `profiles.display_name` (what the user set in Settings), then auth user_metadata,
 * then email local-part. Falls back to "Someone".
 */
export async function fetchTripHostDisplayName(svc: SupabaseClient, ownerUserId: string | null): Promise<string> {
  if (!ownerUserId) return "Someone";
  const label = await fetchAuthUserDisplayLabel(svc, ownerUserId);
  return label === "Traveler" ? "Someone" : label;
}
