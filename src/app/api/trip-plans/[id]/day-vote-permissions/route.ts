import { NextResponse } from "next/server";
import { fetchTripPlanRoster } from "@/backend/trip-plan-roster";
import { fetchTripPlanRowForCollab } from "@/backend/trip-plan-collab-fetch";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { buildClassifiedDecisions, parseCollabState, type CollabStateV1 } from "@/shared/collaboration";
import { normalizePlan } from "@/shared/trip-plan";
import { isUuid } from "@/shared/is-uuid";

type UpdateBody = {
  memberUserId?: string;
  permission?: "vote_only" | "can_suggest";
};

function withPermission(collab: CollabStateV1, memberUserId: string, permission: "vote_only" | "can_suggest"): CollabStateV1 {
  const next = { ...(collab.daySuggestPermissions ?? {}) };
  if (permission === "can_suggest") next[memberUserId] = "can_suggest";
  else delete next[memberUserId];
  const out: CollabStateV1 = { ...collab };
  if (Object.keys(next).length) out.daySuggestPermissions = next;
  else delete out.daySuggestPermissions;
  return out;
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) return NextResponse.json({ error: "Invalid trip id" }, { status: 400 });

  const auth = await createAuthServerClient();
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = getSupabaseServiceRoleClient();
  if (!svc) return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { row, error } = await fetchTripPlanRowForCollab(svc, id);
  if (error || !row?.plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const collab = parseCollabState(row.collab_state);
  const permissions = collab.daySuggestPermissions ?? {};

  if (!access.isHost) {
    return NextResponse.json({
      isHost: false as const,
      viewerPermission: permissions[user.id] ?? "vote_only",
    });
  }

  const plan = normalizePlan(row.plan);
  const classified = buildClassifiedDecisions(plan);
  const roster = await fetchTripPlanRoster(svc, id, collab, classified);
  const members = roster
    .filter((p) => p.kind === "member" && p.memberId && p.memberId !== user.id)
    .map((p) => ({
      userId: p.memberId as string,
      displayName: p.displayName,
      permission: permissions[p.memberId as string] ?? "vote_only",
    }));

  return NextResponse.json({
    isHost: true as const,
    viewerPermission: "can_suggest" as const,
    members,
  });
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) return NextResponse.json({ error: "Invalid trip id" }, { status: 400 });

  const auth = await createAuthServerClient();
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: UpdateBody;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const memberUserId = typeof body.memberUserId === "string" ? body.memberUserId.trim() : "";
  const permission = body.permission;
  if (!memberUserId || (permission !== "vote_only" && permission !== "can_suggest")) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  const access = await resolveTripAccess(svc, id, user.id);
  if (!access?.isHost) return NextResponse.json({ error: "Only host can manage permissions" }, { status: 403 });
  if (memberUserId === user.id) return NextResponse.json({ error: "Host always has suggest access" }, { status: 400 });

  const { data: mRow } = await svc
    .from("trip_memberships")
    .select("role")
    .eq("trip_plan_id", id)
    .eq("user_id", memberUserId)
    .maybeSingle();
  if (mRow?.role !== "member") {
    return NextResponse.json({ error: "Target user is not a trip member" }, { status: 404 });
  }

  const { row, error } = await fetchTripPlanRowForCollab(svc, id);
  if (error || !row?.plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const collab = parseCollabState(row.collab_state);
  const nextCollab = withPermission(collab, memberUserId, permission);

  const { error: upErr } = await svc
    .from("trip_plans")
    .update({ collab_state: nextCollab, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (upErr) return NextResponse.json({ error: "Could not save permission" }, { status: 500 });

  return NextResponse.json({ ok: true as const, permission });
}

