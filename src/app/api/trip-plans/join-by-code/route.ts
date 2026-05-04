import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { findTripPlanIdByInviteCode } from "@/backend/trip-invite-lookup";
import { normalizeInviteCode } from "@/backend/invite-code";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import {
  assertMayJoinAsMember,
  getTripRoleForUser,
  insertMemberMembership,
} from "@/backend/trip-memberships";
import { getDbErrorMessage } from "@/backend/supabase-errors";

export async function POST(req: Request) {
  let body: { code?: unknown };
  try {
    body = (await req.json()) as { code?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createAuthServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized", detail: "Sign in to join a trip." }, { status: 401 });
  }

  const rawCode = typeof body.code === "string" ? body.code : "";
  const code = normalizeInviteCode(rawCode);
  if (code.length !== 6) {
    return NextResponse.json({ error: "Enter a valid 6-character invite code." }, { status: 400 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  let trip: { id: string } | null = null;
  try {
    trip = await findTripPlanIdByInviteCode(svc, code);
  } catch (e) {
    console.error("[join-by-code] trip lookup failed:", e);
    return NextResponse.json({ error: "Could not look up that code." }, { status: 500 });
  }

  if (!trip?.id) {
    return NextResponse.json({ error: "No trip found for that code." }, { status: 404 });
  }

  const tripId = trip.id;

  const { data: planRow } = await svc.from("trip_plans").select("user_id").eq("id", tripId).maybeSingle();
  const ownerId = typeof planRow?.user_id === "string" ? planRow.user_id : null;
  if (ownerId === user.id) {
    return NextResponse.json(
      {
        error: "You can't join your own invite code — you're the host of this trip. Open it from My Trips instead.",
        code: "host_own_trip",
      },
      { status: 400 }
    );
  }

  try {
    await assertMayJoinAsMember(svc, tripId, user.id);
    const existing = await getTripRoleForUser(svc, tripId, user.id);
    if (existing === "member" || existing === "host") {
      return NextResponse.json({ ok: true as const, tripId, alreadyMember: true as const });
    }
    await insertMemberMembership(svc, tripId, user.id);
  } catch (e) {
    const msg = getDbErrorMessage(e, "Could not join trip.");
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true as const, tripId });
}
