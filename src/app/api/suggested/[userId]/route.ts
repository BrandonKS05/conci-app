import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { listSuggested } from "@/backend/social-follow";
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
    error: authErr,
  } = await auth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  const users = await listSuggested(svc, userId, user.id);
  return NextResponse.json({ users });
}
