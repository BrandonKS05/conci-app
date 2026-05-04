import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { buildTripLiveRecommendations } from "@/backend/trip-live-bundle";
import { normalizePlan } from "@/shared/trip-plan";
import type { TripLiveRecommendationsPayload } from "@/shared/trip-live-recommendations";
import { isUuid } from "@/shared/is-uuid";

const MEM_TTL_MS = 60 * 60 * 1000;
const mem = new Map<string, { at: number; payload: TripLiveRecommendationsPayload }>();

function planFingerprint(plan: ReturnType<typeof normalizePlan>): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        location: plan.location,
        departureCity: plan.departureCity,
        dates: plan.dates.options,
        peopleCount: plan.people.count,
        vibe: plan.vibe,
        venues: plan.polls?.venues,
      })
    )
    .digest("hex")
    .slice(0, 32);
}

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
  if (!access) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { data, error } = await svc.from("trip_plans").select("plan").eq("id", id).maybeSingle();
  if (error || !data?.plan) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const plan = normalizePlan(data.plan);
  const fp = planFingerprint(plan);
  const key = `${id}:${fp}`;
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < MEM_TTL_MS) {
    return NextResponse.json({ ...hit.payload, cached: true });
  }

  try {
    const payload = await buildTripLiveRecommendations(plan);
    mem.set(key, { at: Date.now(), payload });
    return NextResponse.json({ ...payload, cached: false });
  } catch (e) {
    console.error("[live-recommendations]", e);
    return NextResponse.json(
      {
        cached: false,
        restaurants: [],
        restaurantsError: "Live recommendations failed to load.",
        experiences: [],
        experiencesError: null,
        flights: [],
        flightsError: null,
        drive: null,
        driveError: null,
      },
      { status: 200 }
    );
  }
}
