import { NextResponse } from "next/server";
import { isLikelySamePlace } from "@/backend/place-match";
import { searchPlacesGoogleMaps } from "@/backend/serpapi-places";
import { extractPlaceCandidates } from "@/shared/place-candidates";
import type { PlacePreview } from "@/shared/place-preview";
import type { PlacePreviewResponse, PlaceSearchEvent } from "@/shared/place-search-events";

export const runtime = "nodejs";

async function searchWithFallbacks(q: string, locationHint: string | null): Promise<PlacePreview[]> {
  let raw = await searchPlacesGoogleMaps(q, locationHint);
  if (raw.length) return raw;
  raw = await searchPlacesGoogleMaps(`${q} restaurant`, locationHint);
  if (raw.length) return raw;
  const head = q.split(",")[0]?.trim() ?? q;
  raw = await searchPlacesGoogleMaps(head, locationHint);
  return raw;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
    locationHint?: string | null;
  };
  const text = typeof body.text === "string" ? body.text : "";
  const locationHint = typeof body.locationHint === "string" ? body.locationHint : null;

  if (!text.trim()) {
    return NextResponse.json({ events: [] } satisfies PlacePreviewResponse);
  }

  const candidates = extractPlaceCandidates(text, locationHint);
  if (!candidates.length) {
    return NextResponse.json({ events: [] } satisfies PlacePreviewResponse);
  }

  const q = candidates[0]!;
  const raw = await searchWithFallbacks(q, locationHint);
  const events: PlaceSearchEvent[] = [];

  if (!raw.length) {
    return NextResponse.json({ events: [] } satisfies PlacePreviewResponse);
  }

  const top = raw[0]!;
  if (isLikelySamePlace(q, top)) {
    events.push({
      kind: "confirmed",
      query: q,
      message: `Found “${top.name}” — I’ll use that in your plan.`,
      place: top,
    });
  } else {
    const options = raw.slice(0, 3);
    const shortQ = q.length > 42 ? `${q.slice(0, 40)}…` : q;
    const n = options.length;
    const optPhrase = n === 1 ? "a similar option" : `${n} similar options`;
    events.push({
      kind: "disambiguate",
      query: q,
      message: `Couldn’t find “${shortQ}” exactly — here ${n === 1 ? "is" : "are"} ${optPhrase}. Pick one to continue, or skip.`,
      options,
    });
  }

  return NextResponse.json({ events } satisfies PlacePreviewResponse);
}
