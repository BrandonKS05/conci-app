import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { fetchTripPlanRowForCollab } from "@/backend/trip-plan-collab-fetch";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import {
  allDecisionsResolvedForPlan,
  parseCollabState,
} from "@/shared/collaboration";
import { normalizePlan } from "@/shared/trip-plan";
import { parseTripPlanStatus } from "@/shared/trip-status";
import { isUuid } from "@/shared/is-uuid";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid trip id" }, { status: 400 });
  }

  const supabase = await createAuthServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const { data: ownerRow, error: ownerErr } = await svc
    .from("trip_plans")
    .select("user_id, status")
    .eq("id", id)
    .maybeSingle();

  if (ownerErr || !ownerRow?.user_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (ownerRow.user_id !== user.id) {
    return NextResponse.json({ error: "Only the trip creator can finalize." }, { status: 403 });
  }

  const status = parseTripPlanStatus(ownerRow.status);
  if (status === "finalized") {
    return NextResponse.json({ error: "Trip is already finalized." }, { status: 400 });
  }

  const { row, error: fetchErr } = await fetchTripPlanRowForCollab(svc, id);
  if (fetchErr || !row?.plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const plan = normalizePlan(row.plan);
  const collab = parseCollabState(row.collab_state);
  if (!allDecisionsResolvedForPlan(plan, collab)) {
    return NextResponse.json(
      { error: "Not all decisions are resolved yet.", detail: "Wait until every open decision is locked." },
      { status: 400 }
    );
  }

  const { error: updErr } = await svc
    .from("trip_plans")
    .update({ status: "finalized", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (updErr) {
    console.error("[finalize] update failed:", updErr.message);
    return NextResponse.json({ error: updErr.message }, { status: 503 });
  }

  return NextResponse.json({ ok: true, id });
}
