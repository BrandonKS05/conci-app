import { NextResponse } from "next/server";
import { mapBookingRowToLodgingBrowse } from "@/backend/lodging-hotel-browse-map";
import { getRapidApiKeyDiagnostics, isRapidApiHotelsConfigured } from "@/backend/rapidapi-key";
import { searchHotelsForLodging } from "@/backend/rapidapi-hotels";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import type { LodgingSearchApiResponse } from "@/shared/lodging-search";
import { parseHostLodgingType, type HostLodgingType } from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";

export const runtime = "nodejs";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function asSingle(v: string | null): string {
  return (v ?? "").trim();
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid trip id." }, { status: 400 });
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

  const url = new URL(req.url);
  const destination = asSingle(url.searchParams.get("destination"));
  const checkIn = asSingle(url.searchParams.get("checkIn"));
  const checkOut = asSingle(url.searchParams.get("checkOut"));
  const guests = Math.max(1, Number(url.searchParams.get("guests")) || 2);
  const rooms = Math.max(1, Number(url.searchParams.get("rooms")) || 1);
  const lodgingRaw = asSingle(url.searchParams.get("lodgingType")).toLowerCase();
  const parsedLodgingType = parseHostLodgingType(lodgingRaw);
  const lodgingType: HostLodgingType =
    parsedLodgingType && parsedLodgingType !== "villa" && parsedLodgingType !== "hostel" && parsedLodgingType !== "other"
      ? parsedLodgingType
      : "hotel";

  console.info("[lodging/search] incoming request", {
    tripId: id,
    fullUrl: req.url,
    destination,
    checkIn,
    checkOut,
    guests,
    rooms,
    lodgingType,
    rapidApiConfigured: isRapidApiHotelsConfigured(),
    rapidApiKeyDiagnostics: getRapidApiKeyDiagnostics(),
  });

  if (!destination || destination.length < 2) {
    return NextResponse.json(
      {
        error: "Destination too short.",
        detail: `Got "${destination}" — enter a full city (e.g. Los Angeles, CA).`,
        hotels: [],
      } satisfies LodgingSearchApiResponse,
      { status: 400 }
    );
  }

  if (!ISO_DAY.test(checkIn) || !ISO_DAY.test(checkOut)) {
    return NextResponse.json(
      {
        error: "Invalid dates.",
        detail: "checkIn and checkOut must be YYYY-MM-DD.",
        hotels: [],
      } satisfies LodgingSearchApiResponse,
      { status: 400 }
    );
  }

  if (checkIn >= checkOut) {
    return NextResponse.json(
      {
        error: "Invalid date range.",
        detail: "Check-out must be after check-in.",
        hotels: [],
      } satisfies LodgingSearchApiResponse,
      { status: 400 }
    );
  }

  if (!isRapidApiHotelsConfigured()) {
    return NextResponse.json(
      {
        error: "Lodging search is temporarily unavailable.",
        detail: "Add a manual stay for now, or try search again later.",
        hotels: [],
      } satisfies LodgingSearchApiResponse,
      { status: 503 }
    );
  }

  try {
    const { rows, destId, destinationQuery } = await searchHotelsForLodging(
      { destination, checkIn, checkOut, adults: guests, rooms },
      { limit: 25 }
    );

    const hotels = rows
      .map((row, index) =>
        mapBookingRowToLodgingBrowse(row, {
          cityLabel: destinationQuery,
          checkIn,
          checkOut,
          adults: guests,
          lodgingType,
          index,
        })
      )
      .filter((h): h is NonNullable<typeof h> => h != null);

    console.info("[lodging/search] mapped results", {
      tripId: id,
      destinationQuery,
      destId,
      rawHotelCount: rows.length,
      mappedHotelCount: hotels.length,
    });

    if (hotels.length === 0) {
      return NextResponse.json(
        {
          error: "No stays matched this search.",
          detail: "Try different dates, a larger nearby city, or add the stay manually.",
          hotels: [],
          meta: {
            destinationQuery,
            destId,
            rawHotelCount: rows.length,
            mappedHotelCount: 0,
          },
        } satisfies LodgingSearchApiResponse,
        { status: 200 }
      );
    }

    return NextResponse.json({
      hotels,
      meta: {
        destinationQuery,
        destId,
        rawHotelCount: rows.length,
        mappedHotelCount: hotels.length,
      },
    } satisfies LodgingSearchApiResponse);
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Hotel search failed.";
    console.error("[lodging/search] failed", { tripId: id, errorMessage: raw });
    const isApiSubscriptionError = raw.includes("403") || raw.includes("not subscribed") || raw.includes("401");
    const userMsg = isApiSubscriptionError
      ? "Hotel search is temporarily unavailable. Add your stay manually for now."
      : "Search failed — try again or add your stay manually.";
    const detail = isApiSubscriptionError
      ? "The hotel search integration is not active. You can still add any stay using the manual form above."
      : undefined;
    return NextResponse.json(
      { error: userMsg, ...(detail ? { detail } : {}), hotels: [] } satisfies LodgingSearchApiResponse,
      { status: 502 }
    );
  }
}
