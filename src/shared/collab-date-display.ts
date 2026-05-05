import { voteKeysIntersectAliases } from "@/shared/collab-vote-keys";
import {
  dateVoteMatchesHostBallot,
  formatVoteRangeLabel,
  parseDateOptionToRange,
} from "@/shared/date-option-parse";
import type { TripRosterPerson } from "@/shared/trip-roster";

export type AlternateDateSuggestionRow = {
  voterKey: string;
  voterName: string;
  rangeLabel: string;
};

/** Members who voted for a concrete range that does not match the host ballot — for host visibility. */
export function buildAlternateDateSuggestionRows(
  votes: Record<string, unknown>,
  roster: TripRosterPerson[],
  hostBallotOptions: string[],
  fallbackYear: number
): AlternateDateSuggestionRow[] {
  const rows: AlternateDateSuggestionRow[] = [];
  for (const [vk, raw] of Object.entries(votes)) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    if (dateVoteMatchesHostBallot(raw, hostBallotOptions, fallbackYear)) continue;
    const trimmed = raw.trim();
    const r = parseDateOptionToRange(trimmed, fallbackYear);
    const rangeLabel = r ? formatVoteRangeLabel(r.start, r.end) : trimmed.slice(0, 120);
    const person = roster.find((p) => voteKeysIntersectAliases([vk], new Set(p.voteAliases)));
    const voterName = person?.displayName?.trim() || "Traveler";
    rows.push({ voterKey: vk, voterName, rangeLabel });
  }
  rows.sort((a, b) => a.voterName.localeCompare(b.voterName, undefined, { sensitivity: "base" }));
  return rows;
}
