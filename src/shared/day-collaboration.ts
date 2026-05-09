import type { TripPlan } from "@/shared/trip-plan";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const DAY_VOTE_CATEGORIES = [
  "restaurants",
  "hotels",
  "flights",
  "activities",
  "other",
] as const;

export type DayVoteCategory = (typeof DAY_VOTE_CATEGORIES)[number];

export type DayVoteOption = {
  id: string;
  label: string;
  detail?: string;
  href?: string;
  imageUrl?: string;
  votes: string[];
  suggestedBy?: string;
  lockedDetail?: string;
  lockedAt?: string;
  lockedBy?: string;
};

export type DayVoteCategoryState = {
  options: DayVoteOption[];
  lockedOptionId?: string;
};

export type DayVoteState = Record<DayVoteCategory, DayVoteCategoryState>;
export type DayVoteStateByDate = Record<string, DayVoteState>;

function stableId(prefix: string, seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return `${prefix}:${(h >>> 0).toString(36)}`;
}

function dedupeVotes(votes: string[] | undefined): string[] {
  if (!votes?.length) return [];
  const out: string[] = [];
  for (const v of votes) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (!t || out.includes(t)) continue;
    out.push(t);
  }
  return out;
}

function normalizeOption(row: unknown): DayVoteOption | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const o = row as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const label = typeof o.label === "string" ? o.label.trim() : "";
  if (!id || !label) return null;
  return {
    id,
    label,
    ...(typeof o.detail === "string" && o.detail.trim() ? { detail: o.detail.trim() } : {}),
    ...(typeof o.href === "string" && o.href.startsWith("http") ? { href: o.href } : {}),
    ...(typeof o.imageUrl === "string" && o.imageUrl.startsWith("http") ? { imageUrl: o.imageUrl } : {}),
    votes: dedupeVotes(Array.isArray(o.votes) ? (o.votes as string[]) : []),
    ...(typeof o.suggestedBy === "string" && o.suggestedBy.trim() ? { suggestedBy: o.suggestedBy.trim() } : {}),
    ...(typeof o.lockedDetail === "string" && o.lockedDetail.trim() ? { lockedDetail: o.lockedDetail.trim() } : {}),
    ...(typeof o.lockedAt === "string" && o.lockedAt.trim() ? { lockedAt: o.lockedAt.trim() } : {}),
    ...(typeof o.lockedBy === "string" && o.lockedBy.trim() ? { lockedBy: o.lockedBy.trim() } : {}),
  };
}

function emptyState(): DayVoteState {
  return {
    restaurants: { options: [] },
    hotels: { options: [] },
    flights: { options: [] },
    activities: { options: [] },
    other: { options: [] },
  };
}

export function parseDayVoteState(raw: unknown): DayVoteStateByDate {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: DayVoteStateByDate = {};
  for (const [dateIso, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ISO_DAY.test(dateIso)) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const dateObj = value as Record<string, unknown>;
    const parsed = emptyState();
    for (const category of DAY_VOTE_CATEGORIES) {
      const row = dateObj[category];
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const state = row as Record<string, unknown>;
      const optionsRaw = Array.isArray(state.options) ? state.options : [];
      parsed[category].options = optionsRaw.map(normalizeOption).filter(Boolean) as DayVoteOption[];
      if (typeof state.lockedOptionId === "string" && state.lockedOptionId.trim()) {
        parsed[category].lockedOptionId = state.lockedOptionId.trim();
      }
    }
    out[dateIso] = parsed;
  }
  return out;
}

type SeedOption = Omit<DayVoteOption, "votes">;

function seedOptionsFromPlan(plan: TripPlan, dateIso: string): Record<DayVoteCategory, SeedOption[]> {
  const restaurants = (plan.hostSetup?.restaurantPins ?? [])
    .filter((p) => p.kept && p.dateIso === dateIso && p.place?.name?.trim())
    .map((p) => ({
      id: stableId("rest", p.place.mapsUrl || p.place.name),
      label: p.place.name.trim(),
      detail: p.place.address || undefined,
      href: p.place.mapsUrl || undefined,
      imageUrl: p.place.photoUrl || undefined,
    }));

  const activities = (plan.hostSetup?.activityPins ?? [])
    .filter((p) => p.kept && p.dateIso === dateIso && p.experience?.name?.trim())
    .map((p) => ({
      id: stableId("act", p.experience.bookingUrl || p.experience.name),
      label: p.experience.name.trim(),
      detail: [p.experience.duration, p.experience.pricePerPerson].filter(Boolean).join(" · ") || undefined,
      href: p.experience.bookingUrl || undefined,
      imageUrl: p.experience.coverPhotoUrl || undefined,
    }));

  const stay = plan.hostSetup?.hotelStays?.find((s) => dateIso >= s.startIso && dateIso <= s.endIso);
  const hotels =
    stay?.place?.name?.trim()
      ? [
          {
            id: stableId("hotel", stay.place.mapsUrl || stay.place.name),
            label: stay.place.name.trim(),
            detail: stay.place.address || undefined,
            href: stay.place.mapsUrl || undefined,
            imageUrl: stay.place.photoUrl || undefined,
          },
        ]
      : [];

  return { restaurants, hotels, flights: [], activities, other: [] };
}

export function mergeDayVoteStateForDate(
  plan: TripPlan,
  byDate: DayVoteStateByDate,
  dateIso: string
): DayVoteStateByDate {
  const base = byDate[dateIso] ?? emptyState();
  const seeded = seedOptionsFromPlan(plan, dateIso);
  const next: DayVoteState = emptyState();
  for (const category of DAY_VOTE_CATEGORIES) {
    const prior = base[category];
    const priorMap = new Map(prior.options.map((o) => [o.id, o]));
    const merged: DayVoteOption[] = [];
    for (const s of seeded[category]) {
      const existing = priorMap.get(s.id);
      merged.push({
        id: s.id,
        label: s.label,
        ...(s.detail ? { detail: s.detail } : {}),
        ...(s.href ? { href: s.href } : {}),
        ...(s.imageUrl ? { imageUrl: s.imageUrl } : {}),
        votes: existing?.votes ?? [],
        ...(existing?.suggestedBy ? { suggestedBy: existing.suggestedBy } : {}),
        ...(existing?.lockedDetail ? { lockedDetail: existing.lockedDetail } : {}),
        ...(existing?.lockedAt ? { lockedAt: existing.lockedAt } : {}),
        ...(existing?.lockedBy ? { lockedBy: existing.lockedBy } : {}),
      });
      priorMap.delete(s.id);
    }
    for (const leftover of priorMap.values()) merged.push(leftover);
    next[category] = {
      options: merged,
      ...(prior.lockedOptionId ? { lockedOptionId: prior.lockedOptionId } : {}),
    };
  }
  return { ...byDate, [dateIso]: next };
}

