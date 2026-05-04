import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { isUuid } from "@/shared/is-uuid";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json(
      {
        error: "Server missing SUPABASE_SERVICE_ROLE_KEY.",
        detail: "Required for trip GET by id.",
      },
      { status: 503 }
    );
  }

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { data, error } = await svc
    .from("trip_plans")
    .select("id, plan, seed_text, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[Conci Supabase] trip_plans fetch failed:", {
      id,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json(data);
}

/**
 * Host-only delete: verifies `trip_plans.user_id` matches the signed-in user, then deletes the row.
 * Uses the service role client so the delete always runs against Postgres (RLS user client can report
 * success while deleting 0 rows when policies or `user_id` do not line up).
 */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const authSb = await createAuthServerClient();
  const {
    data: { user },
    error: userError,
  } = await authSb.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = getSupabaseServiceRoleClient();

  if (svc) {
    const { data: plan, error: planErr } = await svc.from("trip_plans").select("user_id").eq("id", id).maybeSingle();

    if (planErr) {
      console.error("[trip-plans DELETE] load plan:", planErr.message);
      return NextResponse.json({ error: planErr.message }, { status: 500 });
    }

    if (!plan) {
      return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    }

    if (plan.user_id !== user.id) {
      return NextResponse.json({ error: "Only the host who created this trip can delete it." }, { status: 403 });
    }

    const { data: deleted, error: delErr } = await svc
      .from("trip_plans")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id");

    if (delErr) {
      console.error("[trip-plans DELETE]", delErr.message);
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    if (!deleted?.length) {
      console.error("[trip-plans DELETE] no row removed", { id, userId: user.id });
      return NextResponse.json({ error: "Trip could not be deleted (no matching row)." }, { status: 409 });
    }

    return NextResponse.json({ ok: true as const });
  }

  /** Fallback when service role is not configured: RLS `trip_delete_own` must allow the delete. */
  const { data: deleted, error: delErr } = await authSb
    .from("trip_plans")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  if (delErr) {
    console.error("[trip-plans DELETE] (anon client)", delErr.message);
    return NextResponse.json({ error: delErr.message }, { status: 400 });
  }

  if (!deleted?.length) {
    return NextResponse.json(
      {
        error: "Trip was not deleted.",
        detail:
          "Add SUPABASE_SERVICE_ROLE_KEY to the server, or confirm this trip is owned by your account (trip_plans.user_id).",
      },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true as const });
}
