import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { getDuffelReservation, cancelDuffelReservation } from "@/backend/duffel/stays";
import { isUuid } from "@/shared/is-uuid";
import type { DuffelStaysRetrieveApiResponse } from "@/shared/duffel-stays";

export const runtime = "nodejs";

async function resolveAccess(tripId: string, userId: string) {
  const svc = getSupabaseServiceRoleClient();
  if (!svc) return null;
  return resolveTripAccess(svc, tripId, userId);
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string; reservationId: string }> }
) {
  const { id, reservationId } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid trip id." }, { status: 400 });
  }

  const auth = await createAuthServerClient();
  const { data: { user }, error: authErr } = await auth.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await resolveAccess(id, user.id);
  if (!access) return NextResponse.json({ error: "Access denied." }, { status: 403 });

  try {
    const { booking } = await getDuffelReservation(reservationId);
    return NextResponse.json({ booking } satisfies DuffelStaysRetrieveApiResponse);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to retrieve booking.";
    console.error("[duffel/stays/[reservationId] GET]", msg);
    return NextResponse.json(
      { error: msg, booking: null } satisfies DuffelStaysRetrieveApiResponse,
      { status: 502 }
    );
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string; reservationId: string }> }
) {
  const { id, reservationId } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid trip id." }, { status: 400 });
  }

  const auth = await createAuthServerClient();
  const { data: { user }, error: authErr } = await auth.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await resolveAccess(id, user.id);
  if (!access) return NextResponse.json({ error: "Access denied." }, { status: 403 });
  if (!access.isHost) {
    return NextResponse.json({ error: "Only the trip host can cancel bookings." }, { status: 403 });
  }

  try {
    await cancelDuffelReservation(reservationId);
    return NextResponse.json({ cancelled: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Cancellation failed.";
    console.error("[duffel/stays/[reservationId] DELETE]", msg);
    return NextResponse.json({ error: msg, cancelled: false }, { status: 502 });
  }
}
