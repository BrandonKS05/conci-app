import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { friendlyLiteApiError, getFreshLiteApiOffer, prebookLiteApiRate, isLiteApiConfigured } from "@/backend/liteapi";
import { isUuid } from "@/shared/is-uuid";
import type { LiteApiPrebookApiResponse } from "@/shared/liteapi";

export const runtime = "nodejs";
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid trip id.", prebook: null, isMock: false } satisfies LiteApiPrebookApiResponse, { status: 400 });
  }

  const auth = await createAuthServerClient();
  const { data: { user }, error: authErr } = await auth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized", prebook: null, isMock: false } satisfies LiteApiPrebookApiResponse, { status: 401 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) return NextResponse.json({ error: "Server misconfigured", prebook: null, isMock: false } satisfies LiteApiPrebookApiResponse, { status: 503 });

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "You don't have access to this trip.", prebook: null, isMock: false } satisfies LiteApiPrebookApiResponse, { status: 403 });
  }
  if (!access.isHost) {
    return NextResponse.json({ error: "Only the trip host can prebook stays.", prebook: null, isMock: false } satisfies LiteApiPrebookApiResponse, { status: 403 });
  }

  if (!isLiteApiConfigured()) {
    return NextResponse.json({ error: "Hotel booking is not configured.", prebook: null, isMock: false } satisfies LiteApiPrebookApiResponse, { status: 503 });
  }

  let body: { rateId?: string; offerId?: string; hotelId?: string; checkIn?: string; checkOut?: string; guests?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON.", prebook: null, isMock: false } satisfies LiteApiPrebookApiResponse, { status: 400 });
  }

  // `offerId` is the roomType-level prebook token. `rateId` is display/source metadata only —
  // it is NOT accepted by /rates/prebook. We always prefer a freshly-refreshed offer.
  const postedOfferId = typeof body.offerId === "string" ? body.offerId.trim() : "";
  const hotelId = typeof body.hotelId === "string" ? body.hotelId.trim() : "";
  if (!postedOfferId && !hotelId) {
    return NextResponse.json({ error: "offerId (or hotelId to refresh) is required.", prebook: null, isMock: false } satisfies LiteApiPrebookApiResponse, { status: 400 });
  }

  try {
    const checkIn = typeof body.checkIn === "string" ? body.checkIn.trim() : "";
    const checkOut = typeof body.checkOut === "string" ? body.checkOut.trim() : "";
    const guests = Math.max(1, Number(body.guests) || 1);
    let offerId = postedOfferId;
    let offerSource: "fresh" | "posted" = "posted";

    if (hotelId && ISO_DAY.test(checkIn) && ISO_DAY.test(checkOut) && checkIn < checkOut) {
      try {
        const fresh = await getFreshLiteApiOffer({
          hotelId,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          adults: guests,
        });
        if (fresh?.offerId) {
          offerId = fresh.offerId;
          offerSource = "fresh";
        }
      } catch (refreshErr) {
        const msg = refreshErr instanceof Error ? refreshErr.message : String(refreshErr);
        console.warn("[liteapi/hotels/prebook] fresh offer refresh failed; using posted offer", msg);
      }
    }

    if (!offerId) {
      return NextResponse.json(
        { error: friendlyLiteApiError("4002 invalid offerId"), prebook: null, isMock: false } satisfies LiteApiPrebookApiResponse,
        { status: 502 }
      );
    }

    console.info("[liteapi/hotels/prebook] prebooking with roomType offerId", { source: offerSource });
    const prebook = await prebookLiteApiRate(offerId);
    return NextResponse.json({ prebook, isMock: false } satisfies LiteApiPrebookApiResponse);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Prebook failed.";
    console.error("[liteapi/hotels/prebook]", msg);
    return NextResponse.json({ error: friendlyLiteApiError(e), prebook: null, isMock: false } satisfies LiteApiPrebookApiResponse, { status: 502 });
  }
}
