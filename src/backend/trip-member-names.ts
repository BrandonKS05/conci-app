import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

function displayFromUser(u: { email?: string | null; user_metadata?: Record<string, unknown> }): string {
  const meta = u.user_metadata;
  const full = meta && typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  const name = meta && typeof meta.name === "string" ? meta.name.trim() : "";
  const emailLocal = u.email?.split("@")[0]?.trim() ?? "";
  return full || name || emailLocal || "Traveler";
}

/** Display names for people on the trip roster (memberships), optionally excluding one user (e.g. viewer). */
export async function fetchTripMemberDisplayNames(
  svc: SupabaseClient,
  tripPlanId: string,
  excludeUserId?: string | null
): Promise<string[]> {
  const { data: rows, error } = await svc.from("trip_memberships").select("user_id").eq("trip_plan_id", tripPlanId);
  if (error) {
    console.error("[trip-member-names]", error.message);
    return [];
  }
  const ids = [
    ...new Set(
      (rows ?? [])
        .map((r) => r.user_id as string)
        .filter((id) => id && id !== (excludeUserId ?? undefined))
    ),
  ];
  const names: string[] = [];
  for (const uid of ids) {
    const { data: u, error: uErr } = await svc.auth.admin.getUserById(uid);
    if (uErr || !u?.user) names.push("Traveler");
    else names.push(displayFromUser(u.user));
  }
  names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return names;
}
