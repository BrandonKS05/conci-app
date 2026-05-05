import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { fetchTripPlanRowForCollab } from "@/backend/trip-plan-collab-fetch";
import { removeTripMemberAsHost } from "@/backend/trip-memberships";
import { parseCollabState, stripMemberVotesFromCollabState } from "@/shared/collaboration";
import { isUuid } from "@/shared/is-uuid";

export async function DELETE(_req: Request, context: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId: targetUserId } = await context.params;
  if (!id || !isUuid(id) || !targetUserId || !isUuid(targetUserId)) {
    return NextResponse.json({ error: "Invalid trip or member id" }, { status: 400 });
  }

  const auth = await createAuthServerClient();
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const removed = await removeTripMemberAsHost(svc, id, targetUserId, user.id);
  if ("error" in removed) {
    return NextResponse.json({ error: removed.error }, { status: removed.status });
  }

  const { row, error: fetchErr } = await fetchTripPlanRowForCollab(svc, id);
  if (fetchErr || !row?.plan) {
    return NextResponse.json({ ok: true as const });
  }

  let collab = parseCollabState(row.collab_state);
  collab = stripMemberVotesFromCollabState(collab, targetUserId);

  const { error: upErr } = await svc
    .from("trip_plans")
    .update({ collab_state: collab, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (upErr) {
    console.warn("[members DELETE] membership removed but collab strip failed:", upErr.message);
  }

  return NextResponse.json({ ok: true as const });
}
