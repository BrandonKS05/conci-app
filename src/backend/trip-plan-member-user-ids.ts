import type { SupabaseClient } from "@supabase/supabase-js";

/** All auth user IDs on this trip (memberships + trip owner when not duplicated). */
export async function fetchTripPlanMemberUserIds(
  svc: SupabaseClient,
  tripPlanId: string
): Promise<Set<string>> {
  const { data: rows } = await svc.from("trip_memberships").select("user_id").eq("trip_plan_id", tripPlanId);
  const { data: plan } = await svc.from("trip_plans").select("user_id").eq("id", tripPlanId).maybeSingle();

  const set = new Set<string>();
  for (const r of rows ?? []) {
    const id = typeof (r as { user_id?: unknown }).user_id === "string" ? (r as { user_id: string }).user_id : null;
    if (id) set.add(id);
  }
  const owner = typeof plan?.user_id === "string" ? plan.user_id : null;
  if (owner) set.add(owner);
  return set;
}
