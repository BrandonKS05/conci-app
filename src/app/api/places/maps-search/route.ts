import { NextResponse } from "next/server";
import { searchPlacesGoogleMaps } from "@/backend/serpapi-places";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    q?: string;
    locationHint?: string | null;
  };
  const q = typeof body.q === "string" ? body.q.trim() : "";
  const hint = typeof body.locationHint === "string" ? body.locationHint : null;
  if (q.length < 2) {
    return NextResponse.json({ places: [] });
  }
  const places = await searchPlacesGoogleMaps(q, hint, { limit: 8 });
  return NextResponse.json({ places });
}
