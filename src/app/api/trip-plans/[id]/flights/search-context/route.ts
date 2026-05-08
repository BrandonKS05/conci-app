import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { fetchFlightAirportSuggestions } from "@/backend/trip-flight-search";
import { hostHasConcreteTripRange, normalizePlan } from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";

/** Read-only host context for flight search (destination airport + trip dates). */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
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
  if (!access?.isHost) {
    return NextResponse.json({ error: "Only the trip host can view this." }, { status: 403 });
  }

  const { data, error } = await svc.from("trip_plans").select("plan").eq("id", id).maybeSingle();
  if (error || !data?.plan) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const plan = normalizePlan(data.plan);
  const loc = plan.location?.trim();
  const tr = plan.hostSetup?.tripRange;
  const datesOk = tr?.startIso && tr.endIso && /^(\d{4}-\d{2}-\d{2})$/.test(tr.startIso) && /^(\d{4}-\d{2}-\d{2})$/.test(tr.endIso);

  if (!loc) {
    return NextResponse.json({
      ready: false,
      reason: "Add a destination on the trip first.",
      destinationAirport: null,
      startIso: null,
      endIso: null,
    });
  }

  if (!hostHasConcreteTripRange(plan) || !datesOk) {
    return NextResponse.json({
      ready: false,
      reason: "Confirm trip dates on the calendar before searching flights.",
      destinationAirport: null,
      startIso: null,
      endIso: null,
    });
  }

  let destinationAirport: { id: string; label: string; subtitle?: string } | null = null;
  try {
    const hint = loc.split(",")[0]!.trim();
    const sug = await fetchFlightAirportSuggestions(hint);
    const first = sug[0];
    if (first) {
      destinationAirport = { id: first.id, label: first.label, subtitle: first.subtitle };
    }
  } catch {
    // non-fatal — client may still type origin
  }

  return NextResponse.json({
    ready: Boolean(destinationAirport),
    reason: destinationAirport ? null : "Could not resolve destination airport from SerpApi.",
    destinationAirport,
    startIso: tr!.startIso,
    endIso: tr!.endIso,
    destinationLabel: loc,
  });
}
