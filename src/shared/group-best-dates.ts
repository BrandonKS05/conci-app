import type { TripRosterPerson } from "@/shared/trip-roster";
import {
  buildParsedDateOptions,
  dateVoteMatchesHostBallot,
  formatLocalIsoRangeVote,
  formatVoteRangeLabel,
  inferDefaultYearFromDateOptions,
  localDayTime,
  parseDateOptionToRange,
} from "@/shared/date-option-parse";

export type GroupBestDatesResult = {
  /** Year used to parse options and votes */
  fallbackYear: number;
  hostRange: { start: Date; end: Date } | null;
  hostRangeLabel: string | null;
  /** Non-host travelers on the roster (and guests) */
  eligibleTravelerCount: number;
  /** Travelers who submitted WFM and/or a date vote */
  respondedTravelerCount: number;
  /** How many eligible travelers overlap the host’s confirmed range */
  hostOverlapCount: number;
  bestRange: { start: Date; end: Date };
  bestRangeLabel: string;
  bestOverlapCount: number;
  /** True when the host’s range ties for the best score and is chosen as the best window */
  hostIsOptimal: boolean;
  /** Suggest switching to `bestRange` (better overlap than host range) */
  suggestAlternative: boolean;
  /** Cannot parse confirmed dates */
  error?: string;
};

function rangesOverlap(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean {
  return localDayTime(a.start) <= localDayTime(b.end) && localDayTime(b.start) <= localDayTime(a.end);
}

function sameRange(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean {
  return localDayTime(a.start) === localDayTime(b.start) && localDayTime(a.end) === localDayTime(b.end);
}

function mergeHostRangeFromOptions(
  hostOptions: string[],
  y0: number
): { start: Date; end: Date } | null {
  const parsed = buildParsedDateOptions(hostOptions, y0);
  if (parsed.length === 0) return null;
  let minT = Infinity;
  let maxT = -Infinity;
  let minD = parsed[0]!.start;
  let maxD = parsed[0]!.end;
  for (const p of parsed) {
    const a = localDayTime(p.start);
    const b = localDayTime(p.end);
    if (a < minT) {
      minT = a;
      minD = p.start;
    }
    if (b > maxT) {
      maxT = b;
      maxD = p.end;
    }
  }
  return { start: minD, end: maxD };
}

type TravelerSlot = { range: { start: Date; end: Date } | null; responded: boolean };

function resolveTravelerAvailability(
  person: TripRosterPerson,
  votes: Record<string, unknown>,
  wfm: Record<string, true | undefined>,
  hostOptions: string[],
  fallbackYear: number,
  hostRange: { start: Date; end: Date } | null
): TravelerSlot {
  let wfmHit = false;
  let voteStr: string | null = null;
  for (const alias of person.voteAliases) {
    if (wfm[alias]) wfmHit = true;
    const v = votes[alias];
    if (!voteStr && typeof v === "string" && v.trim().length) voteStr = v.trim();
  }
  if (wfmHit) {
    if (hostRange) return { range: hostRange, responded: true };
    return { range: null, responded: true };
  }
  if (voteStr) {
    if (hostRange && dateVoteMatchesHostBallot(voteStr, hostOptions, fallbackYear)) {
      return { range: hostRange, responded: true };
    }
    const pr = parseDateOptionToRange(voteStr, fallbackYear);
    if (pr) return { range: { start: pr.start, end: pr.end }, responded: true };
    return { range: null, responded: true };
  }
  return { range: null, responded: false };
}

function rangeKey(r: { start: Date; end: Date }): string {
  return formatLocalIsoRangeVote(r.start, r.end);
}

/**
 * Picks a date window that overlaps the most traveler availability.
 * WFM and votes that match the host ballot count as the host’s confirmed range.
 */
export function computeGroupBestDates(
  hostOptions: string[],
  votes: Record<string, unknown>,
  dateWorksForMe: Record<string, true | undefined> | undefined,
  roster: TripRosterPerson[],
  tripOwnerUserId: string | null | undefined,
  calendarYear: number
): GroupBestDatesResult {
  const fallbackYear = inferDefaultYearFromDateOptions(hostOptions, calendarYear);
  const wfm = dateWorksForMe ?? {};
  const hostRange = mergeHostRangeFromOptions(hostOptions, fallbackYear);
  const hostRangeLabel = hostRange ? formatVoteRangeLabel(hostRange.start, hostRange.end) : null;

  const travelers = roster.filter((p) => !(tripOwnerUserId && p.memberId && p.memberId === tripOwnerUserId));
  const eligibleTravelerCount = Math.max(0, travelers.length);

  const slots: { person: TripRosterPerson; slot: TravelerSlot }[] = travelers.map((person) => ({
    person,
    slot: resolveTravelerAvailability(person, votes, wfm, hostOptions, fallbackYear, hostRange),
  }));

  const respondedTravelerCount = slots.filter((s) => s.slot.responded).length;

  const scoreRange = (r: { start: Date; end: Date }): number =>
    slots.filter((s) => s.slot.range && rangesOverlap(s.slot.range, r)).length;

  const hostOverlapCount = hostRange ? scoreRange(hostRange) : 0;

  const candidateMap = new Map<string, { start: Date; end: Date }>();
  if (hostRange) candidateMap.set(rangeKey(hostRange), hostRange);
  for (const { slot } of slots) {
    if (slot.range) candidateMap.set(rangeKey(slot.range), slot.range);
  }
  for (const [, raw] of Object.entries(votes)) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const pr = parseDateOptionToRange(raw.trim(), fallbackYear);
    if (pr) candidateMap.set(rangeKey({ start: pr.start, end: pr.end }), { start: pr.start, end: pr.end });
  }

  const uniqueCandidates = [...candidateMap.values()];
  if (uniqueCandidates.length === 0) {
    return {
      fallbackYear,
      hostRange,
      hostRangeLabel,
      eligibleTravelerCount,
      respondedTravelerCount,
      hostOverlapCount: 0,
      bestRange: hostRange ?? { start: new Date(), end: new Date() },
      bestRangeLabel: "—",
      bestOverlapCount: 0,
      hostIsOptimal: false,
      suggestAlternative: false,
      error: "No date ranges to compare yet — wait for travelers to share availability.",
    };
  }

  const scored = uniqueCandidates.map((c) => {
    const s = scoreRange(c);
    const isHost = Boolean(hostRange && sameRange(c, hostRange));
    return { c, s, isHost };
  });
  scored.sort((a, b) => {
    if (b.s !== a.s) return b.s - a.s;
    if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
    return localDayTime(a.c.start) - localDayTime(b.c.start);
  });

  const best = scored[0]!;
  const bestRange = best.c;
  const bestOverlapCount = best.s;
  const bestRangeLabel = formatVoteRangeLabel(bestRange.start, bestRange.end);

  const hostIsOptimal = Boolean(hostRange && best.isHost);
  const suggestAlternative = Boolean(hostRange && !best.isHost && bestOverlapCount > hostOverlapCount);

  return {
    fallbackYear,
    hostRange,
    hostRangeLabel,
    eligibleTravelerCount,
    respondedTravelerCount,
    hostOverlapCount,
    bestRange,
    bestRangeLabel,
    bestOverlapCount,
    hostIsOptimal,
    suggestAlternative,
    error: hostRange ? undefined : "Could not parse the confirmed dates — edit the trip card to use clear calendar ranges.",
  };
}
