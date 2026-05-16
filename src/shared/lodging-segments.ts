import type { TripPlan } from "@/shared/trip-plan";
import { enumerateLocalIsoDays } from "@/shared/trip-plan";

/** UI preset: which slice of the trip a lodging segment applies to (multi-city). */
export type LodgingSegmentPreset = {
  id: string;
  label: string;
  cityLabel: string;
  startIso: string;
  endIso: string;
};

function splitIntoContiguousChunks<T>(arr: T[], n: number): T[][] {
  if (n <= 0) return [];
  const size = Math.max(1, Math.ceil(arr.length / n));
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/**
 * Build segment choices for the hotel modal: whole trip plus one chunk per poll destination when 2+ cities.
 * Date splits are even slices of trip days (heuristic until per-stop dates exist on the plan).
 */
export function buildLodgingSegmentPresets(
  plan: TripPlan,
  tripRange: { startIso: string; endIso: string } | null
): LodgingSegmentPreset[] {
  if (!tripRange) return [];
  const days = enumerateLocalIsoDays(tripRange.startIso, tripRange.endIso);
  if (!days.length) return [];

  const destPoll = plan.polls?.destinations?.filter((d) => d?.trim()) ?? [];
  const primaryCity =
    plan.location?.split(",")[0]?.trim() || plan.title?.trim() || "Trip";

  const presets: LodgingSegmentPreset[] = [
    {
      id: "whole",
      label: `Whole trip · ${primaryCity}`,
      cityLabel: primaryCity,
      startIso: tripRange.startIso,
      endIso: tripRange.endIso,
    },
  ];

  if (destPoll.length >= 2) {
    const chunks = splitIntoContiguousChunks(days, destPoll.length);
    for (let i = 0; i < destPoll.length; i++) {
      const chunk = chunks[i];
      const city = destPoll[i]?.trim() || primaryCity;
      if (!chunk?.length) continue;
      presets.push({
        id: `poll-dest-${i}`,
        label: `${city} · ${chunk[0]} → ${chunk[chunk.length - 1]!}`,
        cityLabel: city,
        startIso: chunk[0]!,
        endIso: chunk[chunk.length - 1]!,
      });
    }
  }

  const seen = new Set<string>();
  return presets.filter((p) => {
    const k = `${p.startIso}|${p.endIso}|${p.cityLabel}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
