import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Read display names for trip members.
 *
 * Canonical source of truth is `profiles.display_name` (what the user typed
 * into Settings). Auth user_metadata is a stale mirror in some cases (e.g.
 * older OAuth sign-ups), so always prefer the profiles row.
 */

const FALLBACK = "Traveler";

function pickAuthName(u: { email?: string | null; user_metadata?: Record<string, unknown> }): string {
  const meta = u.user_metadata;
  const full = meta && typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  const name = meta && typeof meta.name === "string" ? meta.name.trim() : "";
  const emailLocal = u.email?.split("@")[0]?.trim() ?? "";
  return full || name || emailLocal || FALLBACK;
}

/** Read profiles.display_name for many users in a single query. */
async function fetchProfileDisplayNames(
  svc: SupabaseClient,
  userIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!userIds.length) return out;
  const { data, error } = await svc
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);
  if (error) {
    console.warn("[trip-member-names] profiles lookup failed:", error.message);
    return out;
  }
  for (const row of data ?? []) {
    const id = typeof row.id === "string" ? row.id : "";
    const name = typeof row.display_name === "string" ? row.display_name.trim() : "";
    if (id && name) out.set(id, name);
  }
  return out;
}

export async function fetchAuthUserDisplayLabel(svc: SupabaseClient, userId: string): Promise<string> {
  const profileNames = await fetchProfileDisplayNames(svc, [userId]);
  const profileName = profileNames.get(userId);
  if (profileName) return profileName;

  const { data: u, error } = await svc.auth.admin.getUserById(userId);
  if (error || !u?.user) return FALLBACK;
  return pickAuthName(u.user);
}

/** Display names for people on the trip roster (memberships), optionally excluding one user (e.g. viewer). */
export async function fetchTripMemberDisplayNames(
  svc: SupabaseClient,
  tripPlanId: string,
  excludeUserId?: string | null
): Promise<string[]> {
  const { data: rows, error } = await svc
    .from("trip_memberships")
    .select("user_id")
    .eq("trip_plan_id", tripPlanId);
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

  const profileNames = await fetchProfileDisplayNames(svc, ids);
  const names: string[] = [];
  for (const uid of ids) {
    const profileName = profileNames.get(uid);
    if (profileName) {
      names.push(profileName);
      continue;
    }
    const { data: u, error: uErr } = await svc.auth.admin.getUserById(uid);
    if (uErr || !u?.user) names.push(FALLBACK);
    else names.push(pickAuthName(u.user));
  }
  names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return names;
}

/**
 * Resolve display names for many users at once. Profiles.display_name takes
 * precedence; falls back to auth metadata or email local-part. Returns a Map
 * keyed by userId — missing users default to "Traveler".
 */
export async function fetchDisplayNameMap(
  svc: SupabaseClient,
  userIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return out;

  const profileNames = await fetchProfileDisplayNames(svc, ids);
  for (const uid of ids) {
    const profileName = profileNames.get(uid);
    if (profileName) {
      out.set(uid, profileName);
      continue;
    }
    const { data: u, error } = await svc.auth.admin.getUserById(uid);
    if (error || !u?.user) {
      out.set(uid, FALLBACK);
      continue;
    }
    out.set(uid, pickAuthName(u.user));
  }
  return out;
}
