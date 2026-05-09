import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { allocateUniqueInviteCode, formatInviteCodeDisplay } from "@/backend/invite-code";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { isUuid } from "@/shared/is-uuid";

/** One-time backfill for trips saved before invite codes were minted on create. */
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
    return NextResponse.json({ error: "Only the host can mint an invite." }, { status: 403 });
  }

  const { data: row, error } = await svc
    .from("trip_plans")
    .select("invite_code, status")
    .eq("id", id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (row.status === "finalized") {
    return NextResponse.json({ error: "Trip is finalized." }, { status: 409 });
  }

  let raw = typeof row.invite_code === "string" ? row.invite_code.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6) : "";
  if (raw.length === 6) {
    return NextResponse.json({
      ok: true as const,
      inviteCode: raw,
      display: formatInviteCodeDisplay(row.invite_code as string),
      alreadyHad: true as const,
    });
  }

  try {
    const allocated = await allocateUniqueInviteCode(svc);
    raw = String(allocated).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
  } catch (e) {
    console.error("[mint-invite]", e);
    return NextResponse.json({ error: "Could not allocate invite code." }, { status: 500 });
  }

  const { error: upErr } = await svc
    .from("trip_plans")
    .update({
      invite_code: raw,
      updated_at: new Date().toISOString(),
      ...(row.status === "draft" ? { status: "voting" as const } : {}),
    })
    .eq("id", id);

  if (upErr) {
    console.error("[mint-invite] update", upErr.message);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true as const,
    inviteCode: raw,
    display: formatInviteCodeDisplay(raw),
    alreadyHad: false as const,
  });
}
