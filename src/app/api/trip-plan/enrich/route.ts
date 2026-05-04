import { NextResponse } from "next/server";
import { normalizePlan } from "@/shared/trip-plan";

export const runtime = "nodejs";

/**
 * Legacy endpoint: previously called a model to “fill gaps” on new trips, which invented
 * dates, vibes, polls, etc. Trip parser now keeps only user-grounded fields; this route
 * only normalizes shape for clients that still POST here.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { plan?: unknown };
  if (!body.plan || typeof body.plan !== "object") {
    return NextResponse.json({ error: "Missing plan" }, { status: 400 });
  }

  return NextResponse.json({ plan: normalizePlan(body.plan) });
}
