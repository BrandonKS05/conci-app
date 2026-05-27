import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { setMemberRoleAsOwner } from "@/backend/trip-memberships";
import { isUuid } from "@/shared/is-uuid";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string; userId: string }> }
) {
  const { id, userId: targetUserId } = await context.params;
  if (!id || !isUuid(id) || !targetUserId || !isUuid(targetUserId)) {
    return NextResponse.json({ error: "Invalid trip or member id" }, { status: 400 });
  }

  const auth = await createAuthServerClient();
  const {
    data: { user },
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { role?: unknown };
  const newRole = body.role;
  if (newRole !== "co-host" && newRole !== "member") {
    return NextResponse.json({ error: "role must be 'co-host' or 'member'" }, { status: 400 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const result = await setMemberRoleAsOwner(svc, id, targetUserId, user.id, newRole);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true as const });
}
