import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { bookLiteApiRate, isLiteApiConfigured } from "@/backend/liteapi";
import {
  normalizePlan,
  parseHostSetup,
  applyHostLodgingSegment,
  upsertLodgingActivitiesInGeneratedItinerary,
} from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";
import type { LiteApiBookingGuest, LiteApiBookApiResponse } from "@/shared/liteapi";
import type { PlaceSpotlight } from "@/shared/place-preview";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid trip id.", booking: null } satisfies LiteApiBookApiResponse, { status: 400 });
  }

  const auth = await createAuthServerClient();
  const { data: { user }, error: authErr } = await auth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized", booking: null } satisfies LiteApiBookApiResponse, { status: 401 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) return NextResponse.json({ error: "Server misconfigured", booking: null } satisfies LiteApiBookApiResponse, { status: 503 });

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "You don't have access to this trip.", booking: null } satisfies LiteApiBookApiResponse, { status: 403 });
  }
  if (!access.isHost) {
    return NextResponse.json({ error: "Only the trip host can book stays.", booking: null } satisfies LiteApiBookApiResponse, { status: 403 });
  }

  if (!isLiteApiConfigured()) {
    return NextResponse.json({ error: "Hotel booking is not configured.", booking: null } satisfies LiteApiBookApiResponse, { status: 503 });
  }

  let body: {
    prebookId?: string;
    rateId?: string;
    hotelId?: string;
    hotelName?: string;
    checkInDate?: string;
    checkOutDate?: string;
    guest?: LiteApiBookingGuest;
    destinationCity?: string;
    markup?: number;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON.", booking: null } satisfies LiteApiBookApiResponse, { status: 400 });
  }

  const prebookId = typeof body.prebookId === "string" ? body.prebookId.trim() : "";
  const rateId = typeof body.rateId === "string" ? body.rateId.trim() : "";
  const hotelId = typeof body.hotelId === "string" ? body.hotelId.trim() : "";
  const hotelName = typeof body.hotelName === "string" ? body.hotelName.trim() : "";
  const checkInDate = typeof body.checkInDate === "string" ? body.checkInDate.trim() : "";
  const checkOutDate = typeof body.checkOutDate === "string" ? body.checkOutDate.trim() : "";
  const destinationCity = typeof body.destinationCity === "string" ? body.destinationCity.trim() : "";

  if (!prebookId || !rateId || !hotelId || !hotelName || !checkInDate || !checkOutDate) {
    return NextResponse.json(
      { error: "prebookId, rateId, hotelId, hotelName, checkInDate, and checkOutDate are required.", booking: null } satisfies LiteApiBookApiResponse,
      { status: 400 }
    );
  }

  const guest = body.guest;
  if (!guest?.firstName || !guest?.lastName || !guest?.email) {
    return NextResponse.json(
      { error: "guest.firstName, guest.lastName, and guest.email are required.", booking: null } satisfies LiteApiBookApiResponse,
      { status: 400 }
    );
  }

  // Fetch trip plan
  const { data: tripRow, error: tripErr } = await svc
    .from("trip_plans")
    .select("plan, status")
    .eq("id", id)
    .maybeSingle();

  if (tripErr || !tripRow?.plan) {
    return NextResponse.json({ error: "Trip not found.", booking: null } satisfies LiteApiBookApiResponse, { status: 404 });
  }
  if (tripRow.status === "finalized") {
    return NextResponse.json({ error: "This trip is finalized — cannot add new bookings.", booking: null } satisfies LiteApiBookApiResponse, { status: 409 });
  }

  // Call LiteAPI to confirm the booking
  let booking: LiteApiBookApiResponse["booking"];
  try {
    booking = await bookLiteApiRate({
      prebookId,
      rateId,
      hotelId,
      hotelName,
      checkInDate,
      checkOutDate,
      guest,
      clientReference: `conci-${id.slice(0, 8)}`,
      markup: typeof body.markup === "number" ? body.markup : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Booking failed.";
    console.error("[liteapi/hotels/book] booking failed", msg);
    return NextResponse.json({ error: msg, booking: null } satisfies LiteApiBookApiResponse, { status: 502 });
  }

  if (!booking) {
    return NextResponse.json({ error: "Booking failed — no confirmation received.", booking: null } satisfies LiteApiBookApiResponse, { status: 502 });
  }

  // Persist booking into the trip plan
  try {
    const planObj =
      typeof tripRow.plan === "object" && tripRow.plan !== null
        ? (tripRow.plan as Record<string, unknown>)
        : {};

    const place: PlaceSpotlight = {
      name: hotelName,
      address: destinationCity || hotelName,
      spotlightCategory: "hotel",
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [hotelName, destinationCity].filter(Boolean).join(" ")
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
        notes: `LiteAPI booking ${booking.bookingId} · ${booking.status}`,
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
        hotelName,
        destinationCity || hotelName,
        undefined
      );
      planMerged = { ...planMerged, generatedItinerary: gi };
    }

    const nextPlan = normalizePlan(planMerged);
    const { error: upErr } = await svc
      .from("trip_plans")
      .update({ plan: nextPlan as unknown as Record<string, unknown>, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (upErr) {
      console.error("[liteapi/hotels/book] failed to persist to trip plan", upErr.message);
    }
  } catch (saveErr) {
    console.error("[liteapi/hotels/book] plan save error", saveErr);
  }

  return NextResponse.json({ booking } satisfies LiteApiBookApiResponse);
}
