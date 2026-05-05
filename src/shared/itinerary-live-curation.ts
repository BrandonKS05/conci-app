import type { LiveExperienceCard, LiveFlightCard } from "@/shared/trip-live-recommendations";
import type { RestaurantPick } from "@/shared/restaurants";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Keys for live suggestion rows (restaurants, experiences, flights). Stored on `TripPlan.itineraryLiveCuration`. */
export type ItineraryLiveCuration = {
  kept: string[];
  dismissed: string[];
  /** yyyy-mm-dd within the trip — which day each kept key is intended for (host scheduling). */
  scheduledDates?: Record<string, string>;
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

function sanitizeScheduledDates(raw: unknown, validKeys: Set<string>): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  const o = raw as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    if (!validKeys.has(k)) continue;
    if (typeof v !== "string") continue;
    const d = v.trim();
    if (!ISO_DAY.test(d)) continue;
    out[k] = d;
  }
  return out;
}

/** Keep schedule entries only for keys still in `kept`. */
export function pruneScheduledDatesForKept(
  kept: string[],
  scheduled: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!scheduled || !Object.keys(scheduled).length) return undefined;
  const out: Record<string, string> = {};
  for (const k of kept) {
    const d = scheduled[k];
    if (typeof d === "string" && ISO_DAY.test(d.trim())) out[k] = d.trim();
  }
  if (!Object.keys(out).length) return undefined;
  return out;
}

export function parseItineraryLiveCuration(raw: unknown): ItineraryLiveCuration | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const kept = sanitizeKeyList(o.kept);
  const dismissed = sanitizeKeyList(o.dismissed);
  const scheduledIn = sanitizeScheduledDates(o.scheduledDates, new Set(kept));
  const scheduled = pruneScheduledDatesForKept(kept, scheduledIn) ?? {};
  const hasScheduled = Object.keys(scheduled).length > 0;
  if (!kept.length && !dismissed.length && !hasScheduled) return undefined;
  return {
    kept,
    dismissed,
    ...(hasScheduled ? { scheduledDates: scheduled } : {}),
  };
}

export function mergeItineraryLiveCuration(
  cur: ItineraryLiveCuration | undefined,
  action: "keep" | "dismiss" | "unkeep" | "undismiss",
  key: string,
  scheduleDateIso?: string | null
): ItineraryLiveCuration {
  const kept = new Set(cur?.kept ?? []);
  const dismissed = new Set(cur?.dismissed ?? []);
  const scheduled: Record<string, string> = { ...(cur?.scheduledDates ?? {}) };

  switch (action) {
    case "keep":
      kept.add(key);
      dismissed.delete(key);
      if (typeof scheduleDateIso === "string" && ISO_DAY.test(scheduleDateIso.trim())) {
        scheduled[key] = scheduleDateIso.trim();
      }
      break;
    case "dismiss":
      dismissed.add(key);
      kept.delete(key);
      delete scheduled[key];
      break;
    case "unkeep":
      kept.delete(key);
      delete scheduled[key];
      break;
    case "undismiss":
      dismissed.delete(key);
      break;
  }

  const keptArr = [...kept].slice(0, MAX_LIVE_CURATION_KEYS);
  const prunedSchedule = pruneScheduledDatesForKept(keptArr, scheduled);

  return {
    kept: keptArr,
    dismissed: [...dismissed].slice(0, MAX_LIVE_CURATION_KEYS),
    ...(prunedSchedule ? { scheduledDates: prunedSchedule } : {}),
  };
}
