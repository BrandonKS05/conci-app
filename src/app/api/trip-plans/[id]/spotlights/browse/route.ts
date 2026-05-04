import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { searchPlacesGoogleMaps } from "@/backend/serpapi-places";
import { normalizePlan } from "@/shared/trip-plan";
import { spotlightStableIdFromMapsUrl } from "@/shared/spotlight-stable-id";
import { isUuid } from "@/shared/is-uuid";

const ROTATING = (loc: string) =>
  [
    `${loc} highly rated restaurants`,
    `${loc} casual dinner`,
    `${loc} rooftop dining`,
    `${loc} seafood restaurant`,
    `${loc} sushi restaurant`,
    `${loc} brunch spots`,
    `${loc} italian restaurant`,
    `${loc} steakhouse`,
  ].map((q) => q.replace(/\s+/g, " ").trim());

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid trip id" }, { status: 400 });
  }

  const auth = await createAuthServerClient();
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    spotlightId?: string;
    mode?: "different" | "more";
    page?: number;
    excludeMapsUrls?: string[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const spotlightId = typeof body.spotlightId === "string" ? body.spotlightId.trim() : "";
  const mode = body.mode === "more" ? "more" : "different";
  const page = typeof body.page === "number" && body.page >= 0 ? Math.floor(body.page) : 0;
  const exclude = new Set(
    Array.isArray(body.excludeMapsUrls) ? body.excludeMapsUrls.filter((u) => typeof u === "string") : []
  );

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await svc.from("trip_plans").select("plan").eq("id", id).maybeSingle();
  if (error || !data?.plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const plan = normalizePlan(data.plan);
  const loc = (plan.location || "").trim() || "downtown";
  const spotlight = (plan.spotlights ?? []).find((s) => spotlightStableIdFromMapsUrl(s.mapsUrl) === spotlightId);
  if (!spotlight) {
    return NextResponse.json({ error: "Unknown spotlight" }, { status: 400 });
  }

  exclude.add(spotlight.mapsUrl);

  let query = "";
  let start = 0;
  if (mode === "more") {
    query = `${spotlight.name} ${loc}`.slice(0, 200);
    start = page * 20;
  } else {
    const hints = ROTATING(loc);
    query = hints[page % hints.length] || `${loc} restaurants`;
    start = 0;
  }

  const raw = await searchPlacesGoogleMaps(query, loc, { start, limit: 20 });
  const picked = raw.filter((p) => !exclude.has(p.mapsUrl)).slice(0, 3);

  return NextResponse.json({
    places: picked,
    queryUsed: query,
    start,
    mode,
    page,
  });
}
