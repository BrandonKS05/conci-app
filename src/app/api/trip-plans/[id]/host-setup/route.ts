import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import {
  normalizePlan,
  parseHostSetup,
  planRecordWithDatesSyncedToTripRange,
  type GeneratedItinerary,
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
  if (patch.hotelStays !== undefined) out.hotelStays = patch.hotelStays;
  if (patch.flightBookings !== undefined) out.flightBookings = patch.flightBookings;
  if (patch.packingList !== undefined) out.packingList = patch.packingList;
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
  if (!access) {
    return NextResponse.json({ error: "You don't have access to this trip." }, { status: 403 });
  }
  if (!access.isHost) {
    return NextResponse.json({ error: "Only the trip host can update trip setup." }, { status: 403 });
  }

  let body: {
    hostSetup?: HostSetupPatch;
    budget?: { tier?: string | null; perPerson?: string | null };
    /** When set, replaces `plan.generatedItinerary` (e.g. after lodging sync). */
    generatedItinerary?: GeneratedItinerary;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const hasHostPatch = body.hostSetup && typeof body.hostSetup === "object";
  const hasBudgetPatch = body.budget && typeof body.budget === "object";
  const hasGiPatch = body.generatedItinerary !== undefined;
  if (!hasHostPatch && !hasBudgetPatch && !hasGiPatch) {
    return NextResponse.json(
      { error: "Provide `hostSetup`, `budget`, and/or `generatedItinerary`." },
      { status: 400 }
    );
  }

  const { data: row, error } = await svc
    .from("trip_plans")
    .select("plan, status")
    .eq("id", id)
    .maybeSingle();

  if (error || !row?.plan) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (row.status === "finalized") {
    return NextResponse.json({ error: "This trip is finalized — setup cannot be changed here." }, { status: 409 });
  }

  const planObj = typeof row.plan === "object" && row.plan !== null ? (row.plan as Record<string, unknown>) : {};
  const mergedSetup = hasHostPatch
    ? mergeHostSetupPatch(planObj.hostSetup, body.hostSetup!)
    : parseHostSetup(planObj.hostSetup) ?? {};

  let planMerged: Record<string, unknown> = {
    ...planObj,
    hostSetup: mergedSetup,
  };

  if (hasGiPatch) {
    planMerged = { ...planMerged, generatedItinerary: body.generatedItinerary };
  }

  if (hasBudgetPatch && body.budget) {
    const pb = planObj.budget && typeof planObj.budget === "object" ? (planObj.budget as Record<string, unknown>) : {};
    const prevTier = typeof pb.tier === "string" ? pb.tier : null;
    const prevPP = typeof pb.perPerson === "string" ? pb.perPerson : null;
    planMerged = {
      ...planMerged,
      budget: {
        tier: body.budget.tier !== undefined ? body.budget.tier : prevTier,
        perPerson: body.budget.perPerson !== undefined ? body.budget.perPerson : prevPP,
      },
    };
  }

  if (hasHostPatch && body.hostSetup!.tripRange !== undefined) {
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
