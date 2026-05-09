import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { normalizePlan } from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";

export const runtime = "nodejs";

/** Any trip member: sets `plan.dates.confirmed = true` for the whole group. */
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json({ error: "You don't have access to this trip." }, { status: 403 });
  }

  const { data: row, error: fetchErr } = await svc.from("trip_plans").select("plan").eq("id", id).maybeSingle();
  if (fetchErr || !row?.plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const plan = normalizePlan(row.plan);
  if (plan.dates.options.length === 0) {
    return NextResponse.json(
      { error: "Add dates to the plan first (they may still say TBD)." },
      { status: 400 }
    );
  }

  if (plan.dates.confirmed) {
    return NextResponse.json({ plan, alreadyConfirmed: true as const });
  }

  const nextPlan = { ...plan, dates: { ...plan.dates, confirmed: true } };

  const { error: upErr } = await svc
    .from("trip_plans")
    .update({ plan: nextPlan as unknown as Record<string, unknown>, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (upErr) {
    console.error("[dates/confirm]", upErr);
    return NextResponse.json({ error: "Could not update trip" }, { status: 500 });
  }

  return NextResponse.json({ plan: nextPlan });
}
