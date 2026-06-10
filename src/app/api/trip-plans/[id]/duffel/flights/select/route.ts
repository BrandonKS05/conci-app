import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { isUuid } from "@/shared/is-uuid";
import { normalizePlan, parseHostSetup } from "@/shared/trip-plan";
import { selectedFlightFromOffer } from "@/shared/duffel-flights";
import type { DuffelOffer, DuffelFlightSelectApiResponse } from "@/shared/duffel-flights";

export const runtime = "nodejs";

/**
 * Save a specific flight the host picked from search results WITHOUT booking it,
 * or clear the current selection (DELETE). This persists only `hostSetup.flightSelections`
 * — it never writes itinerary/calendar rows, so search alone cannot fabricate a flight.
 * A trip keeps a single active selection; saving a new flight replaces the prior one.
 */

async function authorize(id: string) {
  if (!id || !isUuid(id)) {
    return { error: NextResponse.json({ selection: null, error: "Invalid trip id." } satisfies DuffelFlightSelectApiResponse, { status: 400 }) };
  }
  const auth = await createAuthServerClient();
  const { data: { user }, error: authErr } = await auth.auth.getUser();
  if (authErr || !user) {
    return { error: NextResponse.json({ selection: null, error: "Unauthorized" } satisfies DuffelFlightSelectApiResponse, { status: 401 }) };
  }
  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return { error: NextResponse.json({ selection: null, error: "Server misconfigured" } satisfies DuffelFlightSelectApiResponse, { status: 503 }) };
  }
  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return { error: NextResponse.json({ selection: null, error: "Trip not found." } satisfies DuffelFlightSelectApiResponse, { status: 403 }) };
  }
  // Selection replaces the host's flight recommendation in hostSetup — host-only,
  // matching the LiteAPI lodging posture.
  if (!access.isHost) {
    return { error: NextResponse.json({ selection: null, error: "Only the trip host can choose the group's flight." } satisfies DuffelFlightSelectApiResponse, { status: 403 }) };
  }
  return { svc };
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const gate = await authorize(id);
  if (gate.error) return gate.error;
  const { svc } = gate;

  let body: { offer?: DuffelOffer; isMock?: boolean; passengerCount?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ selection: null, error: "Invalid JSON." } satisfies DuffelFlightSelectApiResponse, { status: 400 });
  }

  const offer = body.offer;
  if (!offer || typeof offer.id !== "string" || !offer.id.trim() || !Array.isArray(offer.slices) || offer.slices.length === 0) {
    return NextResponse.json(
      { selection: null, error: "A valid Duffel offer with at least one slice is required." } satisfies DuffelFlightSelectApiResponse,
      { status: 400 }
    );
  }

  const { data: tripRow, error: tripErr } = await svc
    .from("trip_plans")
    .select("plan, status")
    .eq("id", id)
    .maybeSingle();

  if (tripErr || !tripRow?.plan) {
    return NextResponse.json({ selection: null, error: "Trip not found." } satisfies DuffelFlightSelectApiResponse, { status: 404 });
  }
  if (tripRow.status === "finalized") {
    return NextResponse.json({ selection: null, error: "This trip is finalized — flights can't be changed." } satisfies DuffelFlightSelectApiResponse, { status: 409 });
  }

  const passengerCount = Math.max(1, Number(body.passengerCount) || offer.passengers?.length || 1);
  const selection = selectedFlightFromOffer(offer, { passengerCount, isMock: body.isMock === true });

  try {
    const planObj = typeof tripRow.plan === "object" && tripRow.plan !== null ? (tripRow.plan as Record<string, unknown>) : {};
    const currentSetup = parseHostSetup(planObj.hostSetup) ?? {};
    const nextPlan = normalizePlan({
      ...planObj,
      hostSetup: { ...currentSetup, flightSelections: [selection] },
    });
    const { error: upErr } = await svc
      .from("trip_plans")
      .update({ plan: nextPlan as unknown as Record<string, unknown>, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (upErr) {
      console.error("[duffel/flights/select] failed to persist selection", upErr.message);
      return NextResponse.json({ selection: null, error: "Could not save your flight." } satisfies DuffelFlightSelectApiResponse, { status: 502 });
    }
  } catch (e) {
    console.error("[duffel/flights/select] save error", e);
    return NextResponse.json({ selection: null, error: "Could not save your flight." } satisfies DuffelFlightSelectApiResponse, { status: 502 });
  }

  return NextResponse.json({ selection } satisfies DuffelFlightSelectApiResponse);
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const gate = await authorize(id);
  if (gate.error) return gate.error;
  const { svc } = gate;

  const { data: tripRow, error: tripErr } = await svc
    .from("trip_plans")
    .select("plan, status")
    .eq("id", id)
    .maybeSingle();

  if (tripErr || !tripRow?.plan) {
    return NextResponse.json({ selection: null, error: "Trip not found." } satisfies DuffelFlightSelectApiResponse, { status: 404 });
  }
  if (tripRow.status === "finalized") {
    return NextResponse.json({ selection: null, error: "This trip is finalized — flights can't be changed." } satisfies DuffelFlightSelectApiResponse, { status: 409 });
  }

  try {
    const planObj = typeof tripRow.plan === "object" && tripRow.plan !== null ? (tripRow.plan as Record<string, unknown>) : {};
    const currentSetup = parseHostSetup(planObj.hostSetup) ?? {};
    const nextSetup = { ...currentSetup };
    delete nextSetup.flightSelections;
    const nextPlan = normalizePlan({ ...planObj, hostSetup: nextSetup });
    const { error: upErr } = await svc
      .from("trip_plans")
      .update({ plan: nextPlan as unknown as Record<string, unknown>, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (upErr) {
      console.error("[duffel/flights/select] failed to clear selection", upErr.message);
      return NextResponse.json({ selection: null, error: "Could not remove your flight." } satisfies DuffelFlightSelectApiResponse, { status: 502 });
    }
  } catch (e) {
    console.error("[duffel/flights/select] clear error", e);
    return NextResponse.json({ selection: null, error: "Could not remove your flight." } satisfies DuffelFlightSelectApiResponse, { status: 502 });
  }

  return NextResponse.json({ selection: null } satisfies DuffelFlightSelectApiResponse);
}
