import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { normalizePlan } from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid trip id" }, { status: 400 });
  }

  const auth = await createAuthServerClient();
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr || !user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { recommendationId?: string; action?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const recommendationId = typeof body.recommendationId === "string" ? body.recommendationId.trim() : "";
  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (!recommendationId || (action !== "dismiss" && action !== "mark_applied")) {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const { data: row, error: fetchErr } = await svc
    .from("trip_plans")
    .select("user_id, plan")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !row?.plan || !row.user_id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (row.user_id !== user.id) {
    return NextResponse.json({ error: "Only the trip owner can resolve recommendations." }, { status: 403 });
  }

  const plan = normalizePlan(row.plan);
  const recommendations = plan.memberRecommendations ?? [];
  const ix = recommendations.findIndex((r) => r.id === recommendationId);
  if (ix < 0) {
    return NextResponse.json({ error: "Recommendation not found." }, { status: 404 });
  }

  if (recommendations[ix]!.status !== "pending") {
    return NextResponse.json({ ok: true as const, plan });
  }

  const nextRecommendations = [...recommendations];
  nextRecommendations[ix] = {
    ...nextRecommendations[ix]!,
    status: action === "dismiss" ? "dismissed" : "applied",
  };
  const nextPlan = normalizePlan({ ...plan, memberRecommendations: nextRecommendations });

  const { error: upErr } = await svc
    .from("trip_plans")
    .update({
      plan: nextPlan as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (upErr) {
    console.error("[member-recommendations PATCH]", upErr.message);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true as const, plan: nextPlan });
}
