import type { LiveExperienceCard, LiveFlightCard } from "@/shared/trip-live-recommendations";
import type { RestaurantPick } from "@/shared/restaurants";

/** Keys for live suggestion rows (restaurants, experiences, flights). Stored on `TripPlan.itineraryLiveCuration`. */
export type ItineraryLiveCuration = {
  kept: string[];
  dismissed: string[];
};

export const MAX_LIVE_CURATION_KEYS = 100;

export function restaurantLiveKey(r: RestaurantPick): string {
  return `r:${r.id}`;
}

export function experienceLiveKey(ex: LiveExperienceCard, index: number): string {
  const seed = `${ex.name.trim()}\0${ex.bookingUrl.trim()}\0${index}`;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return `ex:${(h >>> 0).toString(36)}`;
}

export function flightLiveKey(f: LiveFlightCard, index: number): string {
  const tail = `${index}|${f.airline}|${f.departureTime}|${f.duration}`.replace(/\s+/g, " ").trim();
  return `f:${tail.slice(0, 180)}`;
}

function sanitizeKeyList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const k = x.trim();
    if (k.length < 2 || k.length > 220 || /[\u0000-\u001f]/.test(k)) continue;
    out.push(k);
  }
  return [...new Set(out)].slice(0, MAX_LIVE_CURATION_KEYS);
}

export function parseItineraryLiveCuration(raw: unknown): ItineraryLiveCuration | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const kept = sanitizeKeyList(o.kept);
  const dismissed = sanitizeKeyList(o.dismissed);
  if (!kept.length && !dismissed.length) return undefined;
  return { kept, dismissed };
}

export function mergeItineraryLiveCuration(
  cur: ItineraryLiveCuration | undefined,
  action: "keep" | "dismiss" | "unkeep" | "undismiss",
  key: string
): ItineraryLiveCuration {
  const kept = new Set(cur?.kept ?? []);
  const dismissed = new Set(cur?.dismissed ?? []);
  switch (action) {
    case "keep":
      kept.add(key);
      dismissed.delete(key);
      break;
    case "dismiss":
      dismissed.add(key);
      kept.delete(key);
      break;
    case "unkeep":
      kept.delete(key);
      break;
    case "undismiss":
      dismissed.delete(key);
      break;
  }
  return {
    kept: [...kept].slice(0, MAX_LIVE_CURATION_KEYS),
    dismissed: [...dismissed].slice(0, MAX_LIVE_CURATION_KEYS),
  };
}
