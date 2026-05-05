import { NextResponse } from "next/server";
import { searchPlacesGoogleMaps } from "@/backend/serpapi-places";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    q?: string;
    locationHint?: string | null;
    start?: number;
    limit?: number;
  };
  const q = typeof body.q === "string" ? body.q.trim() : "";
  const hint = typeof body.locationHint === "string" ? body.locationHint : null;
  if (q.length < 2) {
    return NextResponse.json({ places: [] });
  }
  const start = typeof body.start === "number" && body.start >= 0 ? Math.floor(body.start) : 0;
  const limitRaw = typeof body.limit === "number" && body.limit > 0 ? Math.floor(body.limit) : 30;
  const limit = Math.min(Math.max(limitRaw, 1), 30);
  const places = await searchPlacesGoogleMaps(q, hint, { start, limit });
  return NextResponse.json({ places });
}
