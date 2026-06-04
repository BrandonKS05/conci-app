import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { searchLodging } from "@/backend/lodging/lodging-service";
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
    return NextResponse.json({ error: "Invalid trip id.", hotels: [] } satisfies LodgingSearchApiResponse, { status: 400 });
  }

  const auth = await createAuthServerClient();
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized", hotels: [] } satisfies LodgingSearchApiResponse, { status: 401 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured", hotels: [] } satisfies LodgingSearchApiResponse, { status: 503 });
  }

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "You don't have access to this trip.", hotels: [] } satisfies LodgingSearchApiResponse, { status: 403 });
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
      { error: "Invalid dates.", detail: "checkIn and checkOut must be YYYY-MM-DD.", hotels: [] } satisfies LodgingSearchApiResponse,
      { status: 400 }
    );
  }
  if (checkIn >= checkOut) {
    return NextResponse.json(
      { error: "Invalid date range.", detail: "Check-out must be after check-in.", hotels: [] } satisfies LodgingSearchApiResponse,
      { status: 400 }
    );
  }

  try {
    const { hotels, provider } = await searchLodging({
      destination,
      checkIn,
      checkOut,
      guests,
      rooms,
      lodgingType,
      limit: 25,
    });

    console.info("[lodging/search] results", { tripId: id, destination, provider, count: hotels.length });

    if (hotels.length === 0) {
      return NextResponse.json(
        {
          error: "No stays matched this search.",
          detail: "Try different dates, a larger nearby city, or add the stay manually.",
          hotels: [],
          meta: { destinationQuery: destination, destId: null, rawHotelCount: 0, mappedHotelCount: 0, provider },
        } satisfies LodgingSearchApiResponse,
        { status: 200 }
      );
    }

    return NextResponse.json({
      hotels,
      meta: {
        destinationQuery: destination,
        destId: null,
        rawHotelCount: hotels.length,
        mappedHotelCount: hotels.length,
        provider,
      },
    } satisfies LodgingSearchApiResponse);
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Hotel search failed.";
    console.error("[lodging/search] failed", { tripId: id, errorMessage: raw });
    return NextResponse.json(
      {
        error: "Search failed — try again or add your stay manually.",
        detail: "You can still add any stay using the manual form above.",
        hotels: [],
      } satisfies LodgingSearchApiResponse,
      { status: 502 }
    );
  }
}
