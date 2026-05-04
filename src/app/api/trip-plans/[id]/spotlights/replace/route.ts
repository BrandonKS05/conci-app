import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { normalizePlan } from "@/shared/trip-plan";
import type { PlaceSpotlight } from "@/shared/place-preview";
import { spotlightStableIdFromMapsUrl } from "@/shared/spotlight-stable-id";
import { parseCollabState } from "@/shared/collaboration";
import { isUuid } from "@/shared/is-uuid";

function parseSpotlight(raw: unknown): PlaceSpotlight | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const mapsUrl = typeof o.mapsUrl === "string" && o.mapsUrl.startsWith("http") ? o.mapsUrl : "";
  if (!name || !mapsUrl) return null;
  return {
    name,
    mapsUrl,
    rating: typeof o.rating === "number" ? o.rating : undefined,
    reviewCount: typeof o.reviewCount === "number" ? o.reviewCount : undefined,
    address: typeof o.address === "string" ? o.address : undefined,
    priceRange: typeof o.priceRange === "string" ? o.priceRange : undefined,
    photoUrl: typeof o.photoUrl === "string" ? o.photoUrl : null,
    sourceQuery: typeof o.sourceQuery === "string" ? o.sourceQuery : undefined,
  };
}

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

  let body: { spotlightId?: string; place?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const spotlightId = typeof body.spotlightId === "string" ? body.spotlightId.trim() : "";
  const place = parseSpotlight(body.place);
  if (!spotlightId || !place) {
    return NextResponse.json({ error: "Missing spotlightId or place" }, { status: 400 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await svc.from("trip_plans").select("plan, collab_state").eq("id", id).maybeSingle();
  if (error || !data?.plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const plan = normalizePlan(data.plan);
  const list = [...(plan.spotlights ?? [])];
  const idx = list.findIndex((s) => spotlightStableIdFromMapsUrl(s.mapsUrl) === spotlightId);
  if (idx < 0) {
    return NextResponse.json({ error: "Unknown spotlight" }, { status: 400 });
  }

  list[idx] = {
    ...place,
    sourceQuery: place.sourceQuery ?? list[idx]!.sourceQuery,
  };

  const nextPlan = { ...plan, spotlights: list };

  let collab = parseCollabState(data.collab_state);
  const votes = { ...(collab.spotlightVotes ?? {}) };
  const newId = spotlightStableIdFromMapsUrl(place.mapsUrl);
  if (newId !== spotlightId) {
    delete votes[spotlightId];
  }
  collab = { ...collab, spotlightVotes: Object.keys(votes).length ? votes : undefined };

  const { error: upErr } = await svc
    .from("trip_plans")
    .update({
      plan: nextPlan as unknown as Record<string, unknown>,
      collab_state: collab,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (upErr) {
    console.error("[spotlights/replace]", upErr);
    return NextResponse.json({ error: "Could not update plan" }, { status: 500 });
  }

  return NextResponse.json({ ok: true as const, plan: nextPlan, collab });
}
