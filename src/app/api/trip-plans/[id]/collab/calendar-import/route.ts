import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { isUuid } from "@/shared/is-uuid";

export type CalendarBusyRange = {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD (inclusive)
  source: "apple" | "google" | "manual";
};

type ImportBody = {
  busyRanges: CalendarBusyRange[];
};

/** POST /api/trip-plans/[id]/collab/calendar-import
 *  Body: { busyRanges: CalendarBusyRange[] }
 *  Saves the caller's busy dates onto their trip_memberships row for this trip.
 */
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

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: ImportBody;
  try {
    body = (await req.json()) as ImportBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { busyRanges } = body;
  if (!Array.isArray(busyRanges)) {
    return NextResponse.json({ error: "busyRanges must be an array" }, { status: 400 });
  }

  // Validate and sanitize ranges
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const sanitized: CalendarBusyRange[] = [];
  for (const r of busyRanges) {
    if (
      typeof r.start !== "string" ||
      typeof r.end !== "string" ||
      !ISO_DATE.test(r.start) ||
      !ISO_DATE.test(r.end)
    ) {
      continue;
    }
    const source = r.source === "apple" || r.source === "google" ? r.source : "manual";
    sanitized.push({ start: r.start, end: r.end, source });
  }

  const { error: updateErr } = await svc
    .from("trip_memberships")
    .update({ calendar_busy_dates: sanitized })
    .eq("trip_plan_id", id)
    .eq("user_id", user.id);

  if (updateErr) {
    console.error("[calendar-import] update:", updateErr.message);
    return NextResponse.json({ error: "Could not save busy dates" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, stored: true, count: sanitized.length });
}

/** GET /api/trip-plans/[id]/collab/calendar-import
 *  Returns the caller's stored busy ranges for this trip.
 */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
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

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: row } = await svc
    .from("trip_memberships")
    .select("calendar_busy_dates")
    .eq("trip_plan_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const busyRanges: CalendarBusyRange[] = Array.isArray(row?.calendar_busy_dates)
    ? (row.calendar_busy_dates as CalendarBusyRange[])
    : [];

  return NextResponse.json({ busyRanges });
}
