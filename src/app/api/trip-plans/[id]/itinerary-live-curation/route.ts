import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { mergeItineraryLiveCuration } from "@/shared/itinerary-live-curation";
import { enumerateLocalIsoDays, normalizePlan, tripRangeBestEffortFromPlanDates } from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";

const ACTIONS = new Set(["keep", "dismiss", "unkeep", "undismiss"]);

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

  let body: { action?: string; key?: string; dateIso?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const dateIsoRaw = typeof body.dateIso === "string" ? body.dateIso.trim() : "";
  if (!ACTIONS.has(action) || key.length < 2 || key.length > 220 || /[\u0000-\u001f]/.test(key)) {
    return NextResponse.json({ error: "Invalid action or key" }, { status: 400 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!access.isHost) {
    return NextResponse.json({ error: "Only the trip host can add or remove live flight, restaurant, and experience picks." }, { status: 403 });
  }

  const { data, error } = await svc.from("trip_plans").select("plan").eq("id", id).maybeSingle();
  if (error || !data?.plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const plan = normalizePlan(data.plan);
  const fallbackYear = new Date().getFullYear();
  const tripRange = tripRangeBestEffortFromPlanDates(plan, fallbackYear);
  const tripDays = tripRange
    ? enumerateLocalIsoDays(tripRange.startIso, tripRange.endIso)
    : [];

  let scheduleDateIso: string | null | undefined;
  if (action === "keep") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIsoRaw)) {
      return NextResponse.json(
        { error: "Pick a trip day — send dateIso (yyyy-mm-dd) within your trip range." },
        { status: 400 }
      );
    }
    if (!tripDays.length) {
      return NextResponse.json(
        {
          error:
            "Add concrete trip dates on the trip card first — we couldn’t build a day list from this plan.",
        },
        { status: 400 }
      );
    }
    if (!tripDays.includes(dateIsoRaw)) {
      return NextResponse.json(
        { error: "That date is outside this trip’s range. Update trip dates on the card if needed." },
        { status: 400 }
      );
    }
    scheduleDateIso = dateIsoRaw;
  }

  const nextCuration = mergeItineraryLiveCuration(
    plan.itineraryLiveCuration,
    action as "keep" | "dismiss" | "unkeep" | "undismiss",
    key,
    scheduleDateIso
  );
  const hasAny =
    nextCuration.kept.length > 0 ||
    nextCuration.dismissed.length > 0 ||
    Boolean(nextCuration.scheduledDates && Object.keys(nextCuration.scheduledDates).length > 0);
  const nextPlan = {
    ...plan,
    itineraryLiveCuration: hasAny ? nextCuration : undefined,
  };

  const { error: upErr } = await svc
    .from("trip_plans")
    .update({
      plan: nextPlan as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (upErr) {
    console.error("[itinerary-live-curation]", upErr);
    return NextResponse.json({ error: "Could not update plan" }, { status: 500 });
  }

  return NextResponse.json({ ok: true as const, plan: nextPlan });
}
