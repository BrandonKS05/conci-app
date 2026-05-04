import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { isUuid } from "@/shared/is-uuid";

export type DepositRow = {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  contributor_name: string | null;
  created_at: string;
  user_id: string;
};

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
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 503 }
    );
  }

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json(
      { error: "You don't have access to this trip" },
      { status: 403 }
    );
  }

  const { data, error } = await svc
    .from("trip_deposits")
    .select(
      "id, amount_cents, currency, status, contributor_name, created_at, user_id"
    )
    .eq("trip_plan_id", id)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[deposits] fetch failed:", error.message);
    return NextResponse.json(
      { error: "Failed to fetch deposits" },
      { status: 500 }
    );
  }

  const deposits = (data ?? []) as DepositRow[];
  const totalCents = deposits.reduce((sum, d) => sum + d.amount_cents, 0);

  return NextResponse.json({ deposits, total_cents: totalCents });
}
