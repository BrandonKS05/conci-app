import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type TripMembershipRole = "host" | "member";

/** Host row for a trip the user owns (idempotent). */
export async function ensureHostMembership(
  svc: SupabaseClient,
  tripPlanId: string,
  hostUserId: string
): Promise<void> {
  const { data: existing } = await svc
    .from("trip_memberships")
    .select("id")
    .eq("trip_plan_id", tripPlanId)
    .eq("user_id", hostUserId)
    .maybeSingle();
  if (existing?.id) return;
  const { error } = await svc.from("trip_memberships").insert({
    trip_plan_id: tripPlanId,
    user_id: hostUserId,
    role: "host" as const,
    joined_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[trip-memberships] ensureHostMembership", error.message);
    throw new Error(error.message);
  }
}

/** Member join after invite code validated (caller must verify auth user). */
export async function insertMemberMembership(
  svc: SupabaseClient,
  tripPlanId: string,
  memberUserId: string
): Promise<void> {
  const { error } = await svc.from("trip_memberships").insert({
    trip_plan_id: tripPlanId,
    user_id: memberUserId,
    role: "member" as const,
    joined_at: new Date().toISOString(),
  });
  if (error) {
    if (error.code === "23505") {
      throw new Error("You are already a member of this trip.");
    }
    console.error("[trip-memberships] insertMemberMembership", error.message);
    throw new Error(error.message);
  }
}

export async function getTripRoleForUser(
  svc: SupabaseClient,
  tripPlanId: string,
  userId: string
): Promise<TripMembershipRole | null> {
  const { data: row } = await svc
    .from("trip_memberships")
    .select("role")
    .eq("trip_plan_id", tripPlanId)
    .eq("user_id", userId)
    .maybeSingle();
  const r = row?.role;
  if (r === "host" || r === "member") return r;
  return null;
}

/** Host from trip_plans.user_id or membership role host. */
export async function resolveTripAccess(
  svc: SupabaseClient,
  tripPlanId: string,
  userId: string
): Promise<{ role: TripMembershipRole; isHost: boolean } | null> {
  const { data: plan } = await svc.from("trip_plans").select("user_id").eq("id", tripPlanId).maybeSingle();
  const ownerId = typeof plan?.user_id === "string" ? plan.user_id : null;
  if (ownerId === userId) {
    return { role: "host", isHost: true };
  }
  const m = await getTripRoleForUser(svc, tripPlanId, userId);
  if (m === "member") return { role: "member", isHost: false };
  if (m === "host") return { role: "host", isHost: true };
  return null;
}

/** Block join-as-member when the user already owns the trip (host row may be missing on legacy data). */
export async function assertMayJoinAsMember(
  svc: SupabaseClient,
  tripPlanId: string,
  userId: string
): Promise<void> {
  const { data: plan } = await svc.from("trip_plans").select("user_id").eq("id", tripPlanId).maybeSingle();
  if (plan?.user_id === userId) {
    throw new Error("You can't join your own invite code — you're the host of this trip. Open it from My Trips instead.");
  }
}
