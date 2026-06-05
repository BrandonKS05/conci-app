import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { searchDuffelAirports, type AirportSuggestion } from "@/backend/duffel/places";
import { isUuid } from "@/shared/is-uuid";

export const runtime = "nodejs";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ airports: [] as AirportSuggestion[], error: "Invalid trip id." }, { status: 400 });
  }

  const auth = await createAuthServerClient();
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ airports: [] as AirportSuggestion[], error: "Unauthorized" }, { status: 401 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) return NextResponse.json({ airports: [] as AirportSuggestion[], error: "Server misconfigured" }, { status: 503 });

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ airports: [] as AirportSuggestion[], error: "Forbidden" }, { status: 403 });
  }

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  try {
    const airports = await searchDuffelAirports(q);
    return NextResponse.json({ airports });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Airport search failed.";
    console.error("[duffel/flights/airport-search]", msg);
    return NextResponse.json({ airports: [] as AirportSuggestion[], error: msg }, { status: 502 });
  }
}
