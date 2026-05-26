import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { searchDuffelStays } from "@/backend/duffel/stays";
import { isUuid } from "@/shared/is-uuid";
import type { DuffelStaysSearchApiResponse } from "@/shared/duffel-stays";

export const runtime = "nodejs";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
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

  const url = new URL(req.url);
  const destination = (url.searchParams.get("destination") ?? "").trim();
  const checkInDate = (url.searchParams.get("checkIn") ?? "").trim();
  const checkOutDate = (url.searchParams.get("checkOut") ?? "").trim();
  const guests = Math.max(1, Number(url.searchParams.get("guests")) || 2);
  const rooms = Math.max(1, Number(url.searchParams.get("rooms")) || 1);

  if (destination.length < 2) {
    return NextResponse.json(
      { error: "Destination too short.", results: [], searchId: null, isMock: false } satisfies DuffelStaysSearchApiResponse,
      { status: 400 }
    );
  }

  if (!ISO_DAY.test(checkInDate) || !ISO_DAY.test(checkOutDate)) {
    return NextResponse.json(
      { error: "checkIn and checkOut must be YYYY-MM-DD.", results: [], searchId: null, isMock: false } satisfies DuffelStaysSearchApiResponse,
      { status: 400 }
    );
  }

  if (checkInDate >= checkOutDate) {
    return NextResponse.json(
      { error: "Check-out must be after check-in.", results: [], searchId: null, isMock: false } satisfies DuffelStaysSearchApiResponse,
      { status: 400 }
    );
  }

  try {
    const { results, searchId, isMock } = await searchDuffelStays({
      destination,
      checkInDate,
      checkOutDate,
      guests,
      rooms,
    });

    return NextResponse.json({
      results,
      searchId,
      isMock,
    } satisfies DuffelStaysSearchApiResponse);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Duffel search failed.";
    console.error("[duffel/stays/search]", msg);
    return NextResponse.json(
      { error: msg, results: [], searchId: null, isMock: false } satisfies DuffelStaysSearchApiResponse,
      { status: 502 }
    );
  }
}
