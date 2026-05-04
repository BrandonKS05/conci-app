import { NextResponse } from "next/server";

import { getGooglePlacesApiKey } from "@/backend/env-api-keys";
import { isValidGooglePlacesPhotoResourceName } from "@/backend/google-places-photo-media";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name")?.trim() ?? "";
  if (!isValidGooglePlacesPhotoResourceName(name)) {
    return NextResponse.json({ error: "Invalid photo reference" }, { status: 400 });
  }

  const key = getGooglePlacesApiKey();
  if (!key) {
    return NextResponse.json({ error: "Places API not configured" }, { status: 503 });
  }

  const mediaUrl = `https://places.googleapis.com/v1/${name}/media?maxHeightPx=800&maxWidthPx=800`;

  try {
    const res = await fetch(mediaUrl, {
      headers: { "X-Goog-Api-Key": key },
      redirect: "follow",
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Could not load image" }, { status: res.status === 404 ? 404 : 502 });
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
    return new NextResponse(buf, {
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Upstream error" }, { status: 502 });
  }
}
