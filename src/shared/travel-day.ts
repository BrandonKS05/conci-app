/**
 * Travel-day blocking rules shared by the day view and the calendar overview so
 * both order arrival/departure days the same way.
 *
 * Rule: on the arrival day nothing is shown before the flight lands (the flight
 * anchors the top of the day); on the departure day nothing is shown after the
 * flight leaves (the flight anchors the bottom). Non-flight rows keep their
 * natural chronological order. This mirrors the generation-time normalization
 * that forces the outbound flight first on Day 1 and the return flight last on
 * the final day — but applied at render time so every surface agrees.
 */
import { enumerateLocalIsoDays } from "@/shared/trip-plan";

export type TripDayRole = "arrival" | "departure" | "on-trip" | null;

/**
 * Role of a calendar day within the trip range. Single-day trips count as
 * "arrival" (the flight still anchors the top). Days outside the range are null.
 */
export function resolveTripDayRole(
  cellIso: string,
  range: { startIso: string; endIso: string } | null | undefined
): TripDayRole {
  if (!range?.startIso || !range?.endIso) return null;
  const days = enumerateLocalIsoDays(range.startIso, range.endIso);
  if (!days.includes(cellIso)) return null;
  if (cellIso === range.startIso) return "arrival";
  if (cellIso === range.endIso) return "departure";
  return "on-trip";
}

/** True when a row label/title is a flight (not a ground transfer like an Uber/Lyft). */
export function looksLikeFlight(text: string | null | undefined): boolean {
  return typeof text === "string" && /\bflight\b/i.test(text);
}

/** Minutes past midnight that an untimed entry sorts to (end of day). */
export const END_OF_DAY_MINUTES = 24 * 60;
/** Sort weight that pins an arrival flight above everything else on its day. */
export const ARRIVAL_FLIGHT_SORT = -1;
/** Sort weight that pins a departure flight below everything else on its day. */
export const DEPARTURE_FLIGHT_SORT = 100_000;

/**
 * Comparable sort key enforcing the travel-day blocking rule. `baseMinutes` is the
 * entry's own time (minutes past midnight) or null when untimed; flights on the
 * arrival/departure day override that time so they always anchor the day edge.
 */
export function travelDaySortKey(
  isFlight: boolean,
  role: TripDayRole,
  baseMinutes: number | null
): number {
  if (isFlight && role === "arrival") return ARRIVAL_FLIGHT_SORT;
  if (isFlight && role === "departure") return DEPARTURE_FLIGHT_SORT;
  return baseMinutes ?? END_OF_DAY_MINUTES;
}
