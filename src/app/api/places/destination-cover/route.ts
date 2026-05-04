import { NextResponse } from "next/server";
import { searchPlacesGoogleMaps } from "@/backend/serpapi-places";

export const runtime = "nodejs";

/** Hero thumbnail for destination (SerpAPI Google Maps results). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ photoUrl: null }, { status: 200 });
  }

  const loc = `${q.includes(",") ? q : `${q} city landmarks`}`;
  const hits = await searchPlacesGoogleMaps(loc, null, { limit: 3 });
  const photoUrl =
    hits.find((h) => (h.photoUrl ?? "").startsWith("http"))?.photoUrl ??
    hits[0]?.photoUrl ??
    null;

  return NextResponse.json({ photoUrl }, { status: 200 });
}
