import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/backend/supabase/auth-server";
import { getSupabaseServiceRoleClient } from "@/backend/supabase/service-role";
import { resolveTripAccess } from "@/backend/trip-memberships";
import { prebookLiteApiRate, isLiteApiConfigured } from "@/backend/liteapi";
import { isUuid } from "@/shared/is-uuid";
import type { LiteApiPrebookApiResponse } from "@/shared/liteapi";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid trip id.", prebook: null, isMock: false } satisfies LiteApiPrebookApiResponse, { status: 400 });
  }

  const auth = await createAuthServerClient();
  const { data: { user }, error: authErr } = await auth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized", prebook: null, isMock: false } satisfies LiteApiPrebookApiResponse, { status: 401 });
  }

  const svc = getSupabaseServiceRoleClient();
  if (!svc) return NextResponse.json({ error: "Server misconfigured", prebook: null, isMock: false } satisfies LiteApiPrebookApiResponse, { status: 503 });

  const access = await resolveTripAccess(svc, id, user.id);
  if (!access) {
    return NextResponse.json({ error: "You don't have access to this trip.", prebook: null, isMock: false } satisfies LiteApiPrebookApiResponse, { status: 403 });
  }
  if (!access.isHost) {
    return NextResponse.json({ error: "Only the trip host can prebook stays.", prebook: null, isMock: false } satisfies LiteApiPrebookApiResponse, { status: 403 });
  }

  if (!isLiteApiConfigured()) {
    return NextResponse.json({ error: "Hotel booking is not configured.", prebook: null, isMock: false } satisfies LiteApiPrebookApiResponse, { status: 503 });
  }

  let body: { rateId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON.", prebook: null, isMock: false } satisfies LiteApiPrebookApiResponse, { status: 400 });
  }

  const rateId = typeof body.rateId === "string" ? body.rateId.trim() : "";
  if (!rateId) {
    return NextResponse.json({ error: "rateId is required.", prebook: null, isMock: false } satisfies LiteApiPrebookApiResponse, { status: 400 });
  }

  try {
    const prebook = await prebookLiteApiRate(rateId);
    return NextResponse.json({ prebook, isMock: false } satisfies LiteApiPrebookApiResponse);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Prebook failed.";
    console.error("[liteapi/hotels/prebook]", msg);
    return NextResponse.json({ error: msg, prebook: null, isMock: false } satisfies LiteApiPrebookApiResponse, { status: 502 });
  }
}
