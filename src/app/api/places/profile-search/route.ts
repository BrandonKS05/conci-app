import { NextResponse } from "next/server";
import { requireAuth } from "@/backend/supabase/require-auth";
import { searchPlacesGoogleMaps } from "@/backend/serpapi-places";

export const runtime = "nodejs";

export type ProfileSearchResult = {
  name: string;
  address: string;
  photoUrl: string | null;
};

export async function POST(req: Request) {
  const auth = await requireAuth();
  if ("response" in auth) return auth.response;

  const body = (await req.json().catch(() => ({}))) as {
    q?: string;
    mode?: "hotel" | "city";
  };
  const q = typeof body.q === "string" ? body.q.trim() : "";
  const mode = body.mode === "city" ? "city" : "hotel";
  if (q.length < 2) return NextResponse.json({ places: [] });

  const searchQuery = mode === "hotel" ? `${q} hotel` : `${q} city`;
  const places = await searchPlacesGoogleMaps(searchQuery, null, { limit: 8 });

  const results: ProfileSearchResult[] = places.slice(0, 5).map((p) => ({
    name: p.name,
    address: p.address ?? "",
    photoUrl: p.photoUrl ?? null,
  }));

  return NextResponse.json({ places: results });
}
