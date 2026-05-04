import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { fetchTripPlanRowForCollab } from "@/backend/trip-plan-collab-fetch";
import { memberVoteKey } from "@/shared/collab-vote-keys";
import { normalizePlan } from "@/shared/trip-plan";
import { spotlightStableIdFromMapsUrl } from "@/shared/spotlight-stable-id";
import { parseCollabState } from "@/shared/collaboration";
import { isUuid } from "@/shared/is-uuid";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid trip id" }, { status: 400 });
  }

  const auth = await createAuthServerClient();
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { spotlightId?: string };
  try {
    body = (await req.json()) as { spotlightId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const spotlightId = typeof body.spotlightId === "string" ? body.spotlightId.trim() : "";
  if (!spotlightId) {
    return NextResponse.json({ error: "Missing spotlightId" }, { status: 400 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { row, error: fetchErr } = await fetchTripPlanRowForCollab(svc, id);
  if (fetchErr || !row?.plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const plan = normalizePlan(row.plan);
  const valid = (plan.spotlights ?? []).some((s) => spotlightStableIdFromMapsUrl(s.mapsUrl) === spotlightId);
  if (!valid) {
    return NextResponse.json({ error: "Unknown spotlight" }, { status: 400 });
  }

  let collab = parseCollabState(row.collab_state);
  const vk = memberVoteKey(user.id);
  const votes = { ...(collab.spotlightVotes ?? {}) };
  const cur = [...(votes[spotlightId] ?? [])];
  const i = cur.indexOf(vk);
  if (i >= 0) cur.splice(i, 1);
  else cur.push(vk);
  if (cur.length) votes[spotlightId] = cur;
  else delete votes[spotlightId];

  collab = {
    ...collab,
    spotlightVotes: Object.keys(votes).length ? votes : undefined,
  };

  const { error: upErr } = await svc
    .from("trip_plans")
    .update({ collab_state: collab, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (upErr) {
    console.error("[spotlights/vote]", upErr);
    return NextResponse.json({ error: "Could not save vote" }, { status: 500 });
  }

  return NextResponse.json({ ok: true as const, collab });
}
