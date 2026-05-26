import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { createDuffelStayReservation } from "@/backend/duffel/stays";
import {
  normalizePlan,
  parseHostSetup,
  applyHostLodgingSegment,
  upsertLodgingActivitiesInGeneratedItinerary,
} from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";
import type { DuffelBookingGuestDetails, DuffelStaysBookApiResponse } from "@/shared/duffel-stays";
import type { PlaceSpotlight } from "@/shared/place-preview";

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
    return NextResponse.json({ error: "You don't have access to this trip." }, { status: 403 });
  }
  if (!access.isHost) {
    return NextResponse.json(
      { error: "Only the trip host can book stays.", booking: null } satisfies DuffelStaysBookApiResponse,
      { status: 403 }
    );
  }

  let body: {
    rateId?: string;
    guests?: DuffelBookingGuestDetails[];
    specialRequests?: string | null;
    checkInDate?: string;
    checkOutDate?: string;
    accommodationName?: string;
    accommodationId?: string;
    destinationCity?: string;
    totalAmount?: string;
    currency?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON", booking: null } satisfies DuffelStaysBookApiResponse, { status: 400 });
  }

  const rateId = typeof body.rateId === "string" ? body.rateId.trim() : "";
  const checkInDate = typeof body.checkInDate === "string" ? body.checkInDate.trim() : "";
  const checkOutDate = typeof body.checkOutDate === "string" ? body.checkOutDate.trim() : "";
  const accommodationName = typeof body.accommodationName === "string" ? body.accommodationName.trim() : "";
  const destinationCity = typeof body.destinationCity === "string" ? body.destinationCity.trim() : "";

  if (!rateId || !checkInDate || !checkOutDate || !accommodationName) {
    return NextResponse.json(
      { error: "rateId, checkInDate, checkOutDate, and accommodationName are required.", booking: null } satisfies DuffelStaysBookApiResponse,
      { status: 400 }
    );
  }

  if (!Array.isArray(body.guests) || body.guests.length === 0) {
    return NextResponse.json(
      { error: "At least one guest is required.", booking: null } satisfies DuffelStaysBookApiResponse,
      { status: 400 }
    );
  }

  // Validate lead guest fields
  const leadGuest = body.guests[0]!;
  if (!leadGuest.given_name || !leadGuest.family_name || !leadGuest.email) {
    return NextResponse.json(
      { error: "Lead guest requires given_name, family_name, and email.", booking: null } satisfies DuffelStaysBookApiResponse,
      { status: 400 }
    );
  }

  // Fetch trip plan for enrichment
  const { data: tripRow, error: tripErr } = await svc
    .from("trip_plans")
    .select("plan, status")
    .eq("id", id)
    .maybeSingle();

  if (tripErr || !tripRow?.plan) {
    return NextResponse.json({ error: "Trip not found.", booking: null } satisfies DuffelStaysBookApiResponse, { status: 404 });
  }

  if (tripRow.status === "finalized") {
    return NextResponse.json(
      { error: "This trip is finalized — cannot add new bookings here.", booking: null } satisfies DuffelStaysBookApiResponse,
      { status: 409 }
    );
  }

  // Create the Duffel reservation
  let booking: DuffelStaysBookApiResponse["booking"];
  try {
    const result = await createDuffelStayReservation({
      rateId,
      guests: body.guests,
      checkInDate,
      checkOutDate,
      accommodationName,
      specialRequests: body.specialRequests ?? null,
    });
    booking = result.booking;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Booking failed.";
    console.error("[duffel/stays/book] reservation creation failed", msg);
    return NextResponse.json(
      { error: msg, booking: null } satisfies DuffelStaysBookApiResponse,
      { status: 502 }
    );
  }

  if (!booking) {
    return NextResponse.json(
      { error: "Booking failed — no confirmation received.", booking: null } satisfies DuffelStaysBookApiResponse,
      { status: 502 }
    );
  }

  // Persist the booking into the trip plan
  try {
    const planObj =
      typeof tripRow.plan === "object" && tripRow.plan !== null
        ? (tripRow.plan as Record<string, unknown>)
        : {};

    const place: PlaceSpotlight = {
      name: accommodationName,
      address: destinationCity || accommodationName,
      spotlightCategory: "hotel",
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [accommodationName, destinationCity].filter(Boolean).join(" ")
      )}`,
    };

    const tripRange = (() => {
      const hs = parseHostSetup(planObj.hostSetup);
      return hs?.tripRange ?? null;
    })();

    const rangeStart = tripRange?.startIso ?? checkInDate;
    const rangeEnd = tripRange?.endIso ?? checkOutDate;

    const { hotelStays, hotel: hotelPlace } = applyHostLodgingSegment(
      parseHostSetup(planObj.hostSetup)?.hotelStays,
      rangeStart,
      rangeEnd,
      checkInDate,
      checkOutDate,
      place,
      {
        destinationCity: destinationCity || undefined,
        userSelected: true,
        lodgingType: "hotel",
        // Store the booking reference in the notes field for visibility
        notes: `Duffel booking ${booking.bookingReference} · ${booking.status}`,
        duffelBooking: booking,
      }
    );

    const currentSetup = parseHostSetup(planObj.hostSetup) ?? {};
    const mergedSetup = { ...currentSetup, hotelStays, hotel: hotelPlace };

    let planMerged: Record<string, unknown> = { ...planObj, hostSetup: mergedSetup };

    const currentPlan = normalizePlan(planObj);
    if (currentPlan.generatedItinerary) {
      const gi = upsertLodgingActivitiesInGeneratedItinerary(
        currentPlan.generatedItinerary,
        checkInDate,
        checkOutDate,
        accommodationName,
        destinationCity || accommodationName,
        undefined
      );
      planMerged = { ...planMerged, generatedItinerary: gi };
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
      // Booking succeeded but save failed — return booking anyway so it's not lost
      console.error("[duffel/stays/book] failed to save to trip plan", upErr.message);
    }
  } catch (saveErr) {
    console.error("[duffel/stays/book] plan save error", saveErr);
  }

  return NextResponse.json({ booking } satisfies DuffelStaysBookApiResponse);
}
