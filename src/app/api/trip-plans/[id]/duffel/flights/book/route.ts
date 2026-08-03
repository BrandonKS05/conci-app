import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { bookDuffelFlight, duffelOfferPriceChanged, getDuffelFlightOffer } from "@/backend/duffel/flights";
import { isUuid } from "@/shared/is-uuid";
import { normalizePlan, parseHostSetup } from "@/shared/trip-plan";
import type { DuffelFlightPassenger, DuffelOffer, DuffelFlightsBookApiResponse } from "@/shared/duffel-flights";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid trip id." }, { status: 400 });
  }

  const auth = await createAuthServerClient();
  const { data: { user }, error: authErr } = await auth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Trip not found." }, { status: 403 });
  }
  if (!access.isHost) {
    return NextResponse.json(
      { error: "Only the trip host can book flights.", booking: null } satisfies DuffelFlightsBookApiResponse,
      { status: 403 }
    );
  }

  let body: { offerId?: string; passengers?: DuffelFlightPassenger[]; offer?: DuffelOffer; acceptPriceChange?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON", booking: null } satisfies DuffelFlightsBookApiResponse, { status: 400 });
  }

  const offerId = typeof body.offerId === "string" ? body.offerId.trim() : "";
  const offer = body.offer;
  const passengers = body.passengers;
  const acceptPriceChange = body.acceptPriceChange === true;

  if (!offerId || !offer || !Array.isArray(passengers) || passengers.length === 0) {
    return NextResponse.json(
      { error: "offerId, offer, and passengers are required.", booking: null } satisfies DuffelFlightsBookApiResponse,
      { status: 400 }
    );
  }

  const leadPax = passengers[0]!;
  if (!leadPax.given_name || !leadPax.family_name || !leadPax.email || !leadPax.born_on) {
    return NextResponse.json(
      { error: "Each passenger needs given_name, family_name, email, and born_on.", booking: null } satisfies DuffelFlightsBookApiResponse,
      { status: 400 }
    );
  }

  const { data: tripRow, error: tripErr } = await svc
    .from("trip_plans")
    .select("plan, status")
    .eq("id", id)
    .maybeSingle();

  if (tripErr || !tripRow?.plan) {
    return NextResponse.json({ error: "Trip not found.", booking: null } satisfies DuffelFlightsBookApiResponse, { status: 404 });
  }
  if (tripRow.status === "finalized") {
    return NextResponse.json({ error: "This trip is finalized — cannot add new bookings.", booking: null } satisfies DuffelFlightsBookApiResponse, { status: 409 });
  }

  try {
    const confirmedOffer = (await getDuffelFlightOffer(offerId)) ?? offer;
    if (duffelOfferPriceChanged(offer, confirmedOffer) && !acceptPriceChange) {
      return NextResponse.json(
        {
          booking: null,
          requiresAcceptance: true,
          priceChange: {
            previousAmount: offer.total_amount,
            previousCurrency: offer.total_currency,
            confirmedAmount: confirmedOffer.total_amount,
            confirmedCurrency: confirmedOffer.total_currency,
            confirmedOffer,
          },
          error: "Duffel refreshed this offer. Review and accept the updated price before booking.",
        } satisfies DuffelFlightsBookApiResponse,
        { status: 409 }
      );
    }

    const { booking, isMock } = await bookDuffelFlight({ offerId, passengers, offer: confirmedOffer });

    try {
      const planObj =
        typeof tripRow.plan === "object" && tripRow.plan !== null
          ? (tripRow.plan as Record<string, unknown>)
          : {};
      const currentSetup = parseHostSetup(planObj.hostSetup) ?? {};
      const existing = currentSetup.flightBookings ?? [];
      const flightBookings = [
        ...existing.filter((b) => b.orderId !== booking.orderId),
        { ...booking, ...(isMock ? { isMock: true as const } : {}) },
      ];
      const nextPlan = normalizePlan({
        ...planObj,
        hostSetup: { ...currentSetup, flightBookings },
      });
      const { error: upErr } = await svc
        .from("trip_plans")
        .update({ plan: nextPlan as unknown as Record<string, unknown>, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (upErr) {
        console.error("[duffel/flights/book] failed to persist booking", upErr.message);
      }
    } catch (persistErr) {
      console.error("[duffel/flights/book] plan save error", persistErr);
    }

    return NextResponse.json({ booking, isMock } satisfies DuffelFlightsBookApiResponse);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Booking failed.";
    console.error("[duffel/flights/book]", msg);
    return NextResponse.json(
      { error: msg, booking: null } satisfies DuffelFlightsBookApiResponse,
      { status: 502 }
    );
  }
}
