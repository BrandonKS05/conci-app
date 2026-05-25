import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { fetchAuthUserDisplayLabel } from "@/backend/trip-member-names";
import { isBookingTaskKey, parseBookingTasks } from "@/shared/booking-tasks";
import { parseTripPlanStatus } from "@/shared/trip-status";
import { isUuid } from "@/shared/is-uuid";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
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

  const body = (await request.json().catch(() => ({}))) as {
    task?: string;
    booked?: boolean;
  };
  const task = typeof body.task === "string" ? body.task : "";
  const booked = body.booked === true;
  if (!isBookingTaskKey(task)) {
    return NextResponse.json({ error: "Invalid task (use hotel, hotel:<stay>, flights, restaurant, or activity)." }, { status: 400 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const { data: row, error: fetchErr } = await svc
    .from("trip_plans")
    .select("user_id, status, booking_tasks")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !row?.user_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.user_id !== user.id) {
    return NextResponse.json({ error: "Only the trip owner can update booking tasks." }, { status: 403 });
  }
  if (parseTripPlanStatus(row.status) !== "finalized") {
    return NextResponse.json({ error: "Trip must be finalized first." }, { status: 400 });
  }

  const prev = parseBookingTasks(row.booking_tasks);
  const profileLabel = await fetchAuthUserDisplayLabel(svc, user.id);
  const label = profileLabel === "Traveler" ? "Organizer" : profileLabel;
  const now = new Date().toISOString();

  const nextEntry =
    booked
      ? { booked: true as const, bookedBy: label, bookedAt: now }
      : { booked: false as const, bookedBy: undefined, bookedAt: undefined };

  const merged = { ...prev, [task]: nextEntry };

  const { error: updErr } = await svc
    .from("trip_plans")
    .update({ booking_tasks: merged, updated_at: now })
    .eq("id", id);

  if (updErr) {
    console.error("[booking-tasks] update failed:", updErr.message);
    return NextResponse.json({ error: updErr.message }, { status: 503 });
  }

  return NextResponse.json({ ok: true, booking_tasks: merged });
}
