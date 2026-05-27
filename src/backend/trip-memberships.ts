import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type TripMembershipRole = "host" | "co-host" | "member";

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
  if (r === "host" || r === "co-host" || r === "member") return r;
  return null;
}

/** Host from trip_plans.user_id or membership role host. Co-hosts also get isHost: true. */
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
  if (m === "co-host") return { role: "co-host", isHost: true };
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

/** Host-only: removes a member row and clears their participation from the trip (not the owner). */
export async function removeTripMemberAsHost(
  svc: SupabaseClient,
  tripPlanId: string,
  targetUserId: string,
  actorUserId: string
): Promise<{ ok: true } | { error: string; status: number }> {
  const access = await resolveTripAccess(svc, tripPlanId, actorUserId);
  if (!access?.isHost) {
    return { error: "Only the trip host can remove members.", status: 403 };
  }

  const { data: plan } = await svc.from("trip_plans").select("user_id").eq("id", tripPlanId).maybeSingle();
  const ownerId = typeof plan?.user_id === "string" ? plan.user_id : null;
  if (ownerId && targetUserId === ownerId) {
    return { error: "You can't remove the trip owner.", status: 400 };
  }
  if (targetUserId === actorUserId) {
    return { error: "You can't remove yourself here.", status: 400 };
  }

  const { data: deleted, error } = await svc
    .from("trip_memberships")
    .delete()
    .eq("trip_plan_id", tripPlanId)
    .eq("user_id", targetUserId)
    .in("role", ["member", "co-host"])
    .select("id");

  if (error) {
    console.error("[trip-memberships] removeTripMemberAsHost", error.message);
    return { error: "Could not remove member.", status: 500 };
  }
  if (!deleted?.length) {
    return {
      error: "That traveler isn't listed as a member, or they're the host.",
      status: 404,
    };
  }
  return { ok: true };
}

/**
 * Host-only (trip owner): promotes a member to co-host or demotes a co-host back to member.
 * Only the true trip owner (trip_plans.user_id) can change roles — co-hosts cannot promote others.
 */
export async function setMemberRoleAsOwner(
  svc: SupabaseClient,
  tripPlanId: string,
  targetUserId: string,
  actorUserId: string,
  newRole: "co-host" | "member"
): Promise<{ ok: true } | { error: string; status: number }> {
  const { data: plan } = await svc.from("trip_plans").select("user_id").eq("id", tripPlanId).maybeSingle();
  const ownerId = typeof plan?.user_id === "string" ? plan.user_id : null;

  if (!ownerId || actorUserId !== ownerId) {
    return { error: "Only the trip owner can change member roles.", status: 403 };
  }
  if (targetUserId === ownerId) {
    return { error: "Cannot change the trip owner's role.", status: 400 };
  }
  if (targetUserId === actorUserId) {
    return { error: "You cannot change your own role.", status: 400 };
  }

  const { data: existing } = await svc
    .from("trip_memberships")
    .select("id, role")
    .eq("trip_plan_id", tripPlanId)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (!existing) {
    return { error: "That user is not a member of this trip.", status: 404 };
  }
  if (existing.role === "host") {
    return { error: "Cannot change the role of a host.", status: 400 };
  }

  const { error } = await svc
    .from("trip_memberships")
    .update({ role: newRole })
    .eq("trip_plan_id", tripPlanId)
    .eq("user_id", targetUserId);

  if (error) {
    console.error("[trip-memberships] setMemberRoleAsOwner", error.message);
    return { error: "Could not update role.", status: 500 };
  }

  return { ok: true };
}
