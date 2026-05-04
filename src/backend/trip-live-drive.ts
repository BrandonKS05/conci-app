import type { LiveDriveSummary } from "@/shared/trip-live-recommendations";

const UA = "ConciTripPlanner/1.0 (contact: support@example.com)";

async function geocode(q: string): Promise<{ lat: number; lon: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const arr = (await res.json()) as { lat?: string; lon?: string }[];
  const hit = arr[0];
  if (!hit?.lat || !hit?.lon) return null;
  const lat = Number.parseFloat(hit.lat);
  const lon = Number.parseFloat(hit.lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return { lat, lon };
}

function mapsDirUrl(origin: string, dest: string): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}`;
}

export async function fetchDriveSummary(origin: string, destination: string): Promise<{
  summary: LiveDriveSummary | null;
  error: string | null;
}> {
  const o = origin.trim();
  const d = destination.trim();
  if (!o || !d) return { summary: null, error: null };
  try {
    const a = await geocode(o);
    const b = await geocode(d);
    if (!a || !b) {
      return {
        summary: { mapsDirectionsUrl: mapsDirUrl(o, d), durationEstimate: null, distanceMiles: null },
        error: "Could not geocode cities for drive time (directions link still works).",
      };
    }
    const osrm = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`;
    const r = await fetch(osrm, { headers: { Accept: "application/json" } });
    if (!r.ok) {
      return {
        summary: { mapsDirectionsUrl: mapsDirUrl(o, d), durationEstimate: null, distanceMiles: null },
        error: "Drive time service unavailable.",
      };
    }
    const j = (await r.json()) as { routes?: { duration?: number; distance?: number }[] };
    const route = j.routes?.[0];
    const sec = route?.duration;
    const meters = route?.distance;
    let durationEstimate: string | null = null;
    if (typeof sec === "number" && !Number.isNaN(sec)) {
      const h = Math.floor(sec / 3600);
      const m = Math.round((sec % 3600) / 60);
      durationEstimate = h > 0 ? `${h}h ${m}m` : `${m} min`;
    }
    let distanceMiles: number | null = null;
    if (typeof meters === "number" && !Number.isNaN(meters)) {
      distanceMiles = Math.round((meters / 1609.34) * 10) / 10;
    }
    return {
      summary: {
        mapsDirectionsUrl: mapsDirUrl(o, d),
        durationEstimate,
        distanceMiles,
      },
      error: null,
    };
  } catch (e) {
    return {
      summary: { mapsDirectionsUrl: mapsDirUrl(o, d), durationEstimate: null, distanceMiles: null },
      error: e instanceof Error ? e.message : "Drive lookup failed.",
    };
  }
}
