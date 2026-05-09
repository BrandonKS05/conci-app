import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { fetchAuthUserDisplayLabel } from "@/backend/trip-member-names";
import { fetchTripPlanRowForCollab } from "@/backend/trip-plan-collab-fetch";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { parseCollabState } from "@/shared/collaboration";
import { isUuid } from "@/shared/is-uuid";

const MAX_ADJUSTMENTS = 40;

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) return NextResponse.json({ error: "Invalid trip id" }, { status: 400 });

  const auth = await createAuthServerClient();
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr || !user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { text?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < 1 || text.length > 2000) {
    return NextResponse.json({ error: "Use 1–2000 characters." }, { status: 400 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { row, error } = await fetchTripPlanRowForCollab(svc, id);
  if (error || !row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const collab = parseCollabState(row.collab_state);
  const list = [...(collab.adjustmentSubmissions ?? [])];
  const displayName = await fetchAuthUserDisplayLabel(svc, user.id);

  const pendingByMe = list.filter((s) => s.authorUserId === user.id && s.status === "pending").length;
  if (pendingByMe >= 5) {
    return NextResponse.json(
      { error: "You already have five open suggestions — wait for the host to respond or dismiss an older one." },
      { status: 429 }
    );
  }

  const nextSubmission = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    authorUserId: user.id,
    authorDisplayName: displayName,
    text,
    status: "pending" as const,
  };
  list.push(nextSubmission);

  while (list.length > MAX_ADJUSTMENTS) {
    let dropIx = list.findIndex((s) => s.status === "dismissed");
    if (dropIx < 0) dropIx = list.findIndex((s) => s.status === "applied");
    if (dropIx < 0) {
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      dropIx = 0;
    }
    list.splice(dropIx, 1);
  }

  const nextCollab = { ...collab, adjustmentSubmissions: list };

  const { error: upErr } = await svc
    .from("trip_plans")
    .update({
      collab_state: nextCollab as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (upErr) {
    console.error("[adjustment-submissions POST]", upErr.message);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true as const, submission: nextSubmission });
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) return NextResponse.json({ error: "Invalid trip id" }, { status: 400 });

  const auth = await createAuthServerClient();
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr || !user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { submissionId?: string; action?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const submissionId = typeof body.submissionId === "string" ? body.submissionId.trim() : "";
  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (!submissionId || (action !== "dismiss" && action !== "mark_applied")) {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: ownerRow } = await svc.from("trip_plans").select("user_id").eq("id", id).maybeSingle();
  const ownerId = typeof ownerRow?.user_id === "string" ? ownerRow.user_id : null;
  if (!ownerId || ownerId !== user.id) {
    return NextResponse.json({ error: "Only the trip owner can resolve suggestions." }, { status: 403 });
  }

  const { row, error } = await fetchTripPlanRowForCollab(svc, id);
  if (error || !row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const collab = parseCollabState(row.collab_state);
  const list = collab.adjustmentSubmissions ?? [];
  const ix = list.findIndex((s) => s.id === submissionId);
  if (ix < 0) return NextResponse.json({ error: "Suggestion not found." }, { status: 404 });

  const nextStatus = action === "dismiss" ? ("dismissed" as const) : ("applied" as const);

  /** Idempotent resolve for non-pending rows. */
  if (list[ix]!.status !== "pending") {
    return NextResponse.json({ ok: true as const, collab });
  }

  const nextList = [...list];
  nextList[ix] = {
    ...nextList[ix]!,
    status: nextStatus,
    resolvedAt: new Date().toISOString(),
  };
  const nextCollab = { ...collab, adjustmentSubmissions: nextList };

  const { error: upErr } = await svc
    .from("trip_plans")
    .update({
      collab_state: nextCollab as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (upErr) {
    console.error("[adjustment-submissions PATCH]", upErr.message);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true as const, collab: nextCollab });
}
