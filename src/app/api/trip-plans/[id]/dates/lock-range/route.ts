import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { formatLocalIsoRangeVote } from "@/shared/date-option-parse";
import { normalizePlan } from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";

function parseIsoDay(iso: string): Date | null {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = parseInt(m[1]!, 10);
  const mo = parseInt(m[2]!, 10) - 1;
  const d = parseInt(m[3]!, 10);
  const dt = new Date(y, mo, d, 12, 0, 0, 0);
  return dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === d ? dt : null;
}

/** Any trip member: updates confirmed trip dates to a new inclusive range (still `dates.confirmed`). */
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

  let body: { startIso?: string; endIso?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const startIso = typeof body.startIso === "string" ? body.startIso.trim() : "";
  const endIso = typeof body.endIso === "string" ? body.endIso.trim() : "";
  if (!startIso || !endIso) {
    return NextResponse.json({ error: "Provide startIso and endIso (YYYY-MM-DD)." }, { status: 400 });
  }

  const start = parseIsoDay(startIso);
  const end = parseIsoDay(endIso);
  if (!start || !end) {
    return NextResponse.json({ error: "Invalid date format." }, { status: 400 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "You don't have access to this trip." }, { status: 403 });
  }

  const { data: row, error: fetchErr } = await svc.from("trip_plans").select("plan").eq("id", id).maybeSingle();
  if (fetchErr || !row?.plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const plan = normalizePlan(row.plan);
  if (!plan.dates.confirmed) {
    return NextResponse.json({ error: "Confirm trip dates on the card before locking a range." }, { status: 409 });
  }

  const optionLine = formatLocalIsoRangeVote(start, end);
  const nextPlan = normalizePlan({
    ...(plan as unknown as Record<string, unknown>),
    dates: {
      ...plan.dates,
      confirmed: true,
      options: [optionLine],
    },
  });

  const { error: upErr } = await svc
    .from("trip_plans")
    .update({ plan: nextPlan as unknown as Record<string, unknown>, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (upErr) {
    console.error("[dates/lock-range]", upErr);
    return NextResponse.json({ error: "Could not update trip" }, { status: 500 });
  }

  return NextResponse.json({ plan: nextPlan });
}
