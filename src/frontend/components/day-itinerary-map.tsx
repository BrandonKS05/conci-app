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
  event: { trigger(target: object, eventName: string): void };
}
declare global {
  interface Window {
    google?: { maps: GMapsApi };
    gm_authFailure?: () => void;
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
    // v=weekly = latest stable channel
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      mapsLoadPromise = undefined;
      reject(new Error("Google Maps script failed to load. Check that the Maps JavaScript API is enabled for this key."));
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

// ── Extract lat/lng embedded in a Google Maps URL (@lat,lng,zoom) ────────────
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
  /** Changing this re-geocodes and re-pins for the new day. */
  dateIso: string;
}) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<GMMap | null>(null);
  const markersRef = useRef<GMMarker[]>([]);
  // mapReady stays false until geocoding is done — loading overlay covers grey canvas
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  useEffect(() => {
    if (!apiKey || apiKey === "YOUR_API_KEY" || !mapDivRef.current) return;

    let cancelled = false;
    setError(null);
    setMapReady(false);

    // gm_authFailure fires when the key is invalid or Maps JS API isn't enabled.
    window.gm_authFailure = () => {
      if (!cancelled) {
        setError(
          "Maps JavaScript API auth failed. Make sure the Maps JavaScript API (not just Places API) is enabled for this key in the Google Cloud Console, and that localhost is an allowed referrer."
        );
        setMapReady(true); // lift overlay so the error is readable above the grey canvas
      }
    };

    void (async () => {
      try {
        await loadMapsScript(apiKey);
        if (cancelled || !mapDivRef.current) return;

        // Initialise the map instance once; reuse it across day navigations.
        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new window.google!.maps.Map(mapDivRef.current, {
            zoom: 13,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
          });
        }

        // Clear the previous day's markers.
        for (const m of markersRef.current) m.setMap(null);
        markersRef.current = [];

        if (stops.length === 0) {
          setMapReady(true);
          return;
        }

        const geocoder = new window.google!.maps.Geocoder();
        const bounds = new window.google!.maps.LatLngBounds();
        let placed = 0;

        for (const stop of stops) {
          if (cancelled) return;

          let ll: LatLng | null = null;

          // 1. Prefer coordinates embedded in a Google Maps URL.
          if (stop.mapsUrl) ll = parseLatLngFromMapsUrl(stop.mapsUrl);

          // 2. Fall back to the Geocoding API.
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

        if (cancelled) return;

        if (placed > 1) {
          mapInstanceRef.current!.fitBounds(bounds);
        } else if (placed === 1) {
          const c = bounds.getCenter();
          mapInstanceRef.current!.setCenter({ lat: c.lat(), lng: c.lng() });
          mapInstanceRef.current!.setZoom(15);
        }

        // Trigger a resize so the map repaints correctly after the overlay lifts.
        window.google!.maps.event.trigger(mapInstanceRef.current!, "resize");
        if (placed > 1) mapInstanceRef.current!.fitBounds(bounds);

        setMapReady(true);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Map failed to load.");
          setMapReady(true);
        }
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
        <p className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-xs leading-relaxed text-rose-700 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      <div className="relative">
        {/* Always at full height so the SDK paints into a sized container. */}
        <div
          ref={mapDivRef}
          style={{ height: "360px" }}
          className="w-full"
          aria-label="Day itinerary map"
        />
        {/* Spinner overlay — covers grey canvas until tiles + markers are ready. */}
        {!mapReady ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-100 dark:bg-dm-page/95">
            <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-[#2563EB] dark:border-white/20 dark:border-t-[#60A5FA]" />
            <span className="text-xs text-neutral-400 dark:text-neutral-500">Placing pins…</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
