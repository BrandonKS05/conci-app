import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";

export const runtime = "nodejs";

export async function DELETE() {
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

  const { error: delErr } = await svc.auth.admin.deleteUser(user.id);
  if (delErr) {
    console.error("[account DELETE] admin.deleteUser:", delErr.message);
    return NextResponse.json({ error: "Could not delete account" }, { status: 500 });
  }

  await auth.auth.signOut();

  return NextResponse.json({ ok: true });
}
