import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import {
  normalizePlan,
  parseHostSetup,
  planRecordWithDatesSyncedToTripRange,
  type HostSetupState,
} from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";

type HostSetupPatch = Partial<HostSetupState>;

function mergeHostSetupPatch(current: unknown, patch: HostSetupPatch): HostSetupState {
  const base = parseHostSetup(current) ?? {};
  const out: HostSetupState = { ...base };
  if (patch.tripRange !== undefined) out.tripRange = patch.tripRange;
  if (patch.restaurantPins !== undefined) out.restaurantPins = patch.restaurantPins;
  if (patch.activityPins !== undefined) out.activityPins = patch.activityPins;
  if (patch.hotel !== undefined) out.hotel = patch.hotel;
  if (patch.experiencesOutlined !== undefined) out.experiencesOutlined = patch.experiencesOutlined;
  return out;
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
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
  if (!access?.isHost) {
    return NextResponse.json({ error: "Only the host can update setup." }, { status: 403 });
  }

  let body: { hostSetup?: HostSetupPatch };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.hostSetup || typeof body.hostSetup !== "object") {
    return NextResponse.json({ error: "Field `hostSetup` is required." }, { status: 400 });
  }

  const { data: row, error } = await svc
    .from("trip_plans")
    .select("plan, status")
    .eq("id", id)
    .maybeSingle();

  if (error || !row?.plan) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (row.status !== "draft") {
    return NextResponse.json({ error: "This trip is already published." }, { status: 409 });
  }

  const planObj = typeof row.plan === "object" && row.plan !== null ? (row.plan as Record<string, unknown>) : {};
  const mergedSetup = mergeHostSetupPatch(planObj.hostSetup, body.hostSetup);

  let planMerged: Record<string, unknown> = {
    ...planObj,
    hostSetup: mergedSetup,
  };
  if (body.hostSetup.tripRange !== undefined) {
    planMerged = planRecordWithDatesSyncedToTripRange(planMerged, mergedSetup.tripRange);
  }

  const nextPlan = normalizePlan(planMerged);

  const { error: upErr } = await svc
    .from("trip_plans")
    .update({
      plan: nextPlan as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (upErr) {
    console.error("[host-setup PATCH]", upErr.message);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true as const, plan: nextPlan });
}
