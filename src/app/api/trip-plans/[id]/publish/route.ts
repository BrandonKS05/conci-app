import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { allocateUniqueInviteCode, formatInviteCodeDisplay } from "@/backend/invite-code";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { ensureHostMembership, resolveTripAccess } from "@/backend/trip-memberships";
import { isHostPublishReady, normalizePlan, planAfterHostPublish } from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
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
    return NextResponse.json({ error: "Only the host can publish." }, { status: 403 });
  }

  const { data: row, error } = await svc
    .from("trip_plans")
    .select("plan, status, invite_code")
    .eq("id", id)
    .maybeSingle();

  if (error || !row?.plan) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (row.status !== "draft") {
    return NextResponse.json(
      { error: "Already published.", inviteCode: row.invite_code ?? null },
      { status: 409 }
    );
  }

  const plan = normalizePlan(row.plan);
  if (!isHostPublishReady(plan)) {
    return NextResponse.json(
      { error: "Complete dates, hotel, and at least one restaurant before publishing." },
      { status: 400 }
    );
  }

  const publishedPlan = planAfterHostPublish(plan);

  let inviteCode =
    typeof row.invite_code === "string" && row.invite_code.replace(/\s/g, "").length >= 6
      ? row.invite_code.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6)
      : null;

  if (!inviteCode || inviteCode.length !== 6) {
    try {
      inviteCode = await allocateUniqueInviteCode(svc);
    } catch (e) {
      console.error("[publish POST] allocate invite failed", e);
      return NextResponse.json({ error: "Could not allocate invite code." }, { status: 500 });
    }
  }

  const codeToSave = String(inviteCode).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);

  const { error: upErr } = await svc
    .from("trip_plans")
    .update({
      plan: publishedPlan as unknown as Record<string, unknown>,
      invite_code: codeToSave,
      status: "voting",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (upErr) {
    console.error("[publish POST]", upErr.message);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  try {
    await ensureHostMembership(svc, id, user.id);
  } catch (e) {
    console.warn("[publish POST] ensureHostMembership:", e);
  }

  console.log("[publish POST] ok", {
    tripId: id,
    invite: formatInviteCodeDisplay(codeToSave),
  });

  return NextResponse.json({
    ok: true as const,
    inviteCode: codeToSave,
    plan: publishedPlan,
  });
}
