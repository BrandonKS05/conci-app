import type { SupabaseClient } from "@supabase/supabase-js";

export type TripPlanCollabRow = { plan: unknown; collab_state?: unknown };

/**
 * Load trip_plans row for collaboration. If `collab_state` column is missing in the DB,
 * falls back to `plan` only so the API does not 404 when the trip exists.
 */
export async function fetchTripPlanRowForCollab(
  svc: SupabaseClient,
  id: string
): Promise<{ row: TripPlanCollabRow | null; error: { message: string; code?: string } | null }> {
  const full = await svc.from("trip_plans").select("plan, collab_state").eq("id", id).maybeSingle();

  if (!full.error && full.data) {
    return { row: full.data as TripPlanCollabRow, error: null };
  }

  if (full.error) {
    console.warn("[trip_plans] select(plan, collab_state) failed, retrying plan only:", full.error.message);
  }

  const slim = await svc.from("trip_plans").select("plan").eq("id", id).maybeSingle();
  if (slim.error || !slim.data?.plan) {
    return { row: null, error: slim.error ?? full.error };
  }

  return { row: { plan: slim.data.plan, collab_state: null }, error: null };
}
