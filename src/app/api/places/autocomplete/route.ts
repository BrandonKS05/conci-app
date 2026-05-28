import { NextResponse } from "next/server";
import { requireAuth } from "@/backend/supabase/require-auth";
import { getGooglePlacesApiKey } from "@/backend/env-api-keys";

export const runtime = "nodejs";

export type AutocompleteSuggestion = {
  name: string;
  address: string;
  mapsUrl: string;
};

export async function POST(req: Request) {
  const auth = await requireAuth();
  if ("response" in auth) return auth.response;

  const body = (await req.json().catch(() => ({}))) as {
    q?: string;
    locationHint?: string | null;
  };
  const q = typeof body.q === "string" ? body.q.trim() : "";
  if (q.length < 2) return NextResponse.json({ suggestions: [] });

  const key = getGooglePlacesApiKey();
  if (!key) return NextResponse.json({ suggestions: [] });

  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
    },
    body: JSON.stringify({
      input: q,
      includedPrimaryTypes: ["restaurant", "food", "bar", "bakery", "cafe"],
    }),
    cache: "no-store",
  });

  if (!res.ok) return NextResponse.json({ suggestions: [] });

  const data = (await res.json().catch(() => ({}))) as {
    suggestions?: Array<{
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    }>;
  };

  const suggestions: AutocompleteSuggestion[] = [];
  for (const s of data.suggestions ?? []) {
    const p = s.placePrediction;
    if (!p) continue;
    const name = p.structuredFormat?.mainText?.text ?? p.text?.text ?? "";
    if (!name) continue;
    const address = p.structuredFormat?.secondaryText?.text ?? "";
    const placeId = p.placeId ?? "";
    const mapsUrl = placeId
      ? `https://www.google.com/maps/place/?q=place_id:${placeId}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + (address ? ` ${address}` : ""))}`;
    suggestions.push({ name, address, mapsUrl });
    if (suggestions.length >= 5) break;
  }

  return NextResponse.json({ suggestions });
}
