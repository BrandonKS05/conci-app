import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { isUuid } from "@/shared/is-uuid";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid trip id" }, { status: 400 });
  }

  const supabase = await createAuthServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  // Only the host of this trip may record a withdrawal
  const { data: membership } = await svc
    .from("trip_memberships")
    .select("role")
    .eq("trip_plan_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || membership.role !== "host") {
    return NextResponse.json(
      { error: "Only the trip host can record a withdrawal" },
      { status: 403 }
    );
  }

  // Compute total succeeded deposits
  const { data: deposits, error: depErr } = await svc
    .from("trip_deposits")
    .select("amount_cents")
    .eq("trip_plan_id", id)
    .eq("status", "succeeded");

  if (depErr) {
    return NextResponse.json({ error: "Could not fetch deposits" }, { status: 500 });
  }

  const totalCents = (deposits ?? []).reduce((sum, d) => sum + d.amount_cents, 0);
  if (totalCents === 0) {
    return NextResponse.json({ error: "No funds available to withdraw" }, { status: 400 });
  }

  let note: string | null = null;
  try {
    const body = (await req.json()) as { note?: string };
    note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  } catch {
    // note is optional — ignore parse errors
  }

  const { error: insertErr } = await svc.from("trip_fund_withdrawals").insert({
    trip_plan_id: id,
    host_user_id: user.id,
    amount_cents: totalCents,
    note,
  });

  if (insertErr) {
    console.error("[deposits/withdraw] insert failed:", insertErr.message);
    return NextResponse.json({ error: "Failed to record withdrawal" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, amount_cents: totalCents });
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid trip id" }, { status: 400 });
  }

  const supabase = await createAuthServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  // Only the host can see withdrawals
  const { data: membership } = await svc
    .from("trip_memberships")
    .select("role")
    .eq("trip_plan_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || membership.role !== "host") {
    return NextResponse.json({ error: "Only the trip host can view withdrawals" }, { status: 403 });
  }

  const { data, error } = await svc
    .from("trip_fund_withdrawals")
    .select("id, amount_cents, note, created_at")
    .eq("trip_plan_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Could not fetch withdrawals" }, { status: 500 });
  }

  return NextResponse.json({ withdrawals: data ?? [] });
}
