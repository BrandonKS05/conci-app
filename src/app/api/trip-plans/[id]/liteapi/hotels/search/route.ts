import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { searchLiteApiHotels, isLiteApiConfigured } from "@/backend/liteapi";
import { isUuid } from "@/shared/is-uuid";
import type { LiteApiSearchApiResponse } from "@/shared/liteapi";

export const runtime = "nodejs";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid trip id.", results: [], isMock: false } satisfies LiteApiSearchApiResponse, { status: 400 });
  }

  const auth = await createAuthServerClient();
  const { data: { user }, error: authErr } = await auth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized", results: [], isMock: false } satisfies LiteApiSearchApiResponse, { status: 401 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) return NextResponse.json({ error: "Server misconfigured", results: [], isMock: false } satisfies LiteApiSearchApiResponse, { status: 503 });

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "You don't have access to this trip.", results: [], isMock: false } satisfies LiteApiSearchApiResponse, { status: 403 });
  }

  if (!isLiteApiConfigured()) {
    return NextResponse.json({ error: "Hotel search is not configured.", results: [], isMock: false } satisfies LiteApiSearchApiResponse, { status: 503 });
  }

  const url = new URL(req.url);
  const destination = (url.searchParams.get("destination") ?? "").trim();
  const checkInDate = (url.searchParams.get("checkIn") ?? "").trim();
  const checkOutDate = (url.searchParams.get("checkOut") ?? "").trim();
  const adults = Math.max(1, Number(url.searchParams.get("adults")) || 2);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));

  if (destination.length < 2) {
    return NextResponse.json({ error: "Destination too short.", results: [], isMock: false } satisfies LiteApiSearchApiResponse, { status: 400 });
  }
  if (!ISO_DAY.test(checkInDate) || !ISO_DAY.test(checkOutDate)) {
    return NextResponse.json({ error: "checkIn and checkOut must be YYYY-MM-DD.", results: [], isMock: false } satisfies LiteApiSearchApiResponse, { status: 400 });
  }
  if (checkInDate >= checkOutDate) {
    return NextResponse.json({ error: "Check-out must be after check-in.", results: [], isMock: false } satisfies LiteApiSearchApiResponse, { status: 400 });
  }

  try {
    const results = await searchLiteApiHotels({ destination, checkInDate, checkOutDate, adults, limit });
    return NextResponse.json({ results, isMock: false } satisfies LiteApiSearchApiResponse);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Hotel search failed.";
    console.error("[liteapi/hotels/search]", msg);
    return NextResponse.json({ error: msg, results: [], isMock: false } satisfies LiteApiSearchApiResponse, { status: 502 });
  }
}
