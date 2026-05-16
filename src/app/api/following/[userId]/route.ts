import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { listFollowing } from "@/backend/social-follow";
import { isUuid } from "@/shared/is-uuid";

export const runtime = "nodejs";

export async function GET(_req: Request, context: { params: Promise<{ userId: string }> }) {
  const { userId } = await context.params;
  if (!userId || !isUuid(userId)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const auth = await createAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const users = await listFollowing(svc, userId, user?.id ?? null);
  return NextResponse.json({ users });
}
