"use client";

import { useEffect, useRef, useState } from "react";

export type DayMapStop = {
  index: number;
  label: string;
  sub: string;
  mapsUrl?: string;
};

type LatLng = { lat: number; lng: number };

// ── Minimal Google Maps JS API surface ──────────────────────────────────────
interface GMMap {
  setCenter(ll: LatLng): void;
  setZoom(n: number): void;
  fitBounds(b: GMBounds): void;
}
interface GMMarker {
  setMap(m: GMMap | null): void;
}
interface GMBounds {
  extend(ll: LatLng): void;
  getCenter(): { lat(): number; lng(): number };
}
interface GMGeocoder {
  geocode(
    req: { address: string },
    cb: (
      results: Array<{ geometry: { location: { lat(): number; lng(): number } } }> | null,
      status: string
    ) => void
  ): void;
}
interface GMapsApi {
  Map: new (el: HTMLElement, opts: object) => GMMap;
  Marker: new (opts: object) => GMMarker;
  LatLngBounds: new () => GMBounds;
  Geocoder: new () => GMGeocoder;
}
declare global {
  interface Window {
    google?: { maps: GMapsApi };
  }
}

// ── Script loader (one promise per session) ──────────────────────────────────
let mapsLoadPromise: Promise<void> | undefined;

function loadMapsScript(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();
  if (mapsLoadPromise) return mapsLoadPromise;
  mapsLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      mapsLoadPromise = undefined;
      reject(new Error("Google Maps failed to load — check your API key and domain restrictions."));
    };
    document.head.appendChild(script);
  });
  return mapsLoadPromise;
}

// ── Geocode cache (persists across day navigations within the session) ───────
const geocodeCache = new Map<string, LatLng | null>();

async function geocodeAddress(geocoder: GMGeocoder, address: string): Promise<LatLng | null> {
  if (geocodeCache.has(address)) return geocodeCache.get(address) ?? null;
  return new Promise((resolve) => {
    geocoder.geocode({ address }, (results, status) => {
      const ll =
        status === "OK" && results?.[0]
          ? {
              lat: results[0].geometry.location.lat(),
              lng: results[0].geometry.location.lng(),
            }
          : null;
      geocodeCache.set(address, ll);
      resolve(ll);
    });
  });
}

// ── Extract lat/lng embedded in a Google Maps URL ────────────────────────────
function parseLatLngFromMapsUrl(url: string): LatLng | null {
  const m = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(url);
  if (!m) return null;
  const lat = parseFloat(m[1]!);
  const lng = parseFloat(m[2]!);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function DayItineraryMap({
  stops,
  locationHint,
  dateIso,
}: {
  stops: DayMapStop[];
  locationHint: string | null;
  /** Changing this value re-runs geocoding and re-pins markers for the new day. */
  dateIso: string;
}) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<GMMap | null>(null);
  const markersRef = useRef<GMMarker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // NEXT_PUBLIC_ prefix makes this available in the browser bundle.
  // Replace YOUR_API_KEY with your real key in .env.local:
  //   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=YOUR_API_KEY
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  useEffect(() => {
    if (!apiKey || apiKey === "YOUR_API_KEY" || !mapDivRef.current) return;

    let cancelled = false;
    setError(null);

    void (async () => {
      try {
        await loadMapsScript(apiKey);
        if (cancelled || !mapDivRef.current) return;

        // Initialise map once; reuse across day navigations.
        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new window.google!.maps.Map(mapDivRef.current, {
            zoom: 13,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
          });
          setMapReady(true);
        }

        // Clear previous day's markers.
        for (const m of markersRef.current) m.setMap(null);
        markersRef.current = [];

        if (stops.length === 0) return;

        const geocoder = new window.google!.maps.Geocoder();
        const bounds = new window.google!.maps.LatLngBounds();
        let placed = 0;

        for (const stop of stops) {
          if (cancelled) return;

          let ll: LatLng | null = null;

          // 1. Try to extract coords from a Google Maps URL (@lat,lng).
          if (stop.mapsUrl) ll = parseLatLngFromMapsUrl(stop.mapsUrl);

          // 2. Fall back to Geocoding API.
          if (!ll) {
            const query = locationHint ? `${stop.label}, ${locationHint}` : stop.label;
            ll = await geocodeAddress(geocoder, query);
          }

          if (!ll || cancelled) continue;

          bounds.extend(ll);
          const marker = new window.google!.maps.Marker({
            position: ll,
            map: mapInstanceRef.current!,
            label: {
              text: String(stop.index),
              color: "#fff",
              fontWeight: "bold",
              fontSize: "13px",
            },
            title: `${stop.index}. ${stop.label}`,
          });
          markersRef.current.push(marker);
          placed++;
        }

        if (cancelled || placed === 0) return;

        if (placed > 1) {
          mapInstanceRef.current!.fitBounds(bounds);
        } else {
          const c = bounds.getCenter();
          mapInstanceRef.current!.setCenter({ lat: c.lat(), lng: c.lng() });
          mapInstanceRef.current!.setZoom(15);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Map failed to load.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stops, locationHint, dateIso, apiKey]);

  // ── Missing API key placeholder ───────────────────────────────────────────
  if (!apiKey || apiKey === "YOUR_API_KEY") {
    return (
      <div className="flex min-h-[6rem] items-center justify-center rounded-xl border border-dashed border-amber-300 bg-amber-50 px-5 py-6 text-center text-sm text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/20 dark:text-amber-200">
        Set{" "}
        <code className="mx-1 rounded bg-amber-100 px-1 font-mono text-[11px] dark:bg-amber-900/40">
          NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
        </code>{" "}
        in{" "}
        <code className="mx-1 rounded bg-amber-100 px-1 font-mono text-[11px] dark:bg-amber-900/40">
          .env.local
        </code>{" "}
        to enable the day map.
      </div>
    );
  }

  // ── Rendered map ──────────────────────────────────────────────────────────
  return (
    <section className="overflow-hidden rounded-xl border border-neutral-900/12 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-white/[0.03]">
      <div className="border-b border-neutral-900/8 px-5 py-4 dark:border-white/8 sm:px-6 sm:py-5">
        <h2 className="font-sans text-[13px] font-black uppercase tracking-[0.08em] text-neutral-950 dark:text-white">
          Day map
        </h2>
        <p className="mt-0.5 font-sans text-[11px] text-neutral-500 dark:text-neutral-400">
          {stops.length > 0
            ? `${stops.length} stop${stops.length === 1 ? "" : "s"} · numbered by itinerary order`
            : "No stops to map yet — build an itinerary or pin places first."}
        </p>
      </div>

      {error ? (
        <p className="px-5 py-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>
      ) : null}

      <div className="relative">
        {/* Map container — always at full height so the SDK has a sized element to paint into. */}
        <div
          ref={mapDivRef}
          className="h-80 w-full sm:h-96"
          aria-label="Day itinerary map"
        />
        {/* Loading overlay — hidden once the map instance is ready. */}
        {!mapReady ? (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-50 text-sm text-neutral-400 dark:bg-dm-page/90 dark:text-neutral-500">
            Loading map…
          </div>
        ) : null}
      </div>
    </section>
  );
}
