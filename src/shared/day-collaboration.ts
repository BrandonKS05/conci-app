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

/** Host day page: collaboration for dining, lodging, and activities — not flights (calendar / transport). */
export const DAY_VOTE_DAY_PAGE_CATEGORIES = [
  "restaurants",
  "hotels",
  "activities",
  "other",
] as const satisfies readonly DayVoteCategory[];
export type DayVoteDayPageCategory = (typeof DAY_VOTE_DAY_PAGE_CATEGORIES)[number];

/** Optional hints for auto-seeded “tailored” options (polls, chat, traveler suggestions). */
export type DayVoteCollabHints = {
  cardChat?: { messages: { role: string; text: string }[] };
  adjustmentSubmissions?: { text: string; status: string }[];
};

export type DayVoteOption = {
  id: string;
  label: string;
  detail?: string;
  href?: string;
  imageUrl?: string;
  votes: string[];
  /** Members who marked “not for me” (mutually exclusive with votes for that user). */
  downvotes?: string[];
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
  const dv = dedupeVotes(Array.isArray(o.downvotes) ? (o.downvotes as string[]) : []);
  return {
    id,
    label,
    ...(typeof o.detail === "string" && o.detail.trim() ? { detail: o.detail.trim() } : {}),
    ...(typeof o.href === "string" && o.href.startsWith("http") ? { href: o.href } : {}),
    ...(typeof o.imageUrl === "string" && o.imageUrl.startsWith("http") ? { imageUrl: o.imageUrl } : {}),
    votes: dedupeVotes(Array.isArray(o.votes) ? (o.votes as string[]) : []),
    ...(dv.length ? { downvotes: dv } : {}),
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

type SeedOption = Omit<DayVoteOption, "votes" | "downvotes">;

function mapsSearchUrl(q: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q.replace(/\s+/g, " ").trim())}`;
}

function hasHotelStayForDay(plan: TripPlan, dateIso: string): boolean {
  return (plan.hostSetup?.hotelStays ?? []).some((s) => dateIso >= s.startIso && dateIso <= s.endIso);
}

/** Shortlist ideas from group polls, trip chat, pending traveler notes, vibes & budget. */
function seedTailoredFromGroupContext(
  plan: TripPlan,
  dateIso: string,
  hints: DayVoteCollabHints | undefined
): Record<DayVoteCategory, SeedOption[]> {
  const loc = plan.location?.trim() || plan.title?.trim() || "destination";
  const cityHead = loc.split(",")[0]?.trim() || loc;

  const snippets: string[] = [];
  for (const v of plan.vibe ?? []) {
    const t = v.trim();
    if (t) snippets.push(t);
  }
  if (plan.budget?.tier?.trim()) snippets.push(plan.budget.tier.trim());
  if (plan.budget?.perPerson?.trim()) snippets.push(plan.budget.perPerson.trim());

  for (const m of hints?.cardChat?.messages ?? []) {
    if (m.role === "user" && typeof m.text === "string") {
      const t = m.text.trim().slice(0, 220);
      if (t) snippets.push(t);
    }
  }
  for (const sub of hints?.adjustmentSubmissions ?? []) {
    if (sub.status === "pending" && typeof sub.text === "string") {
      const t = sub.text.trim().slice(0, 220);
      if (t) snippets.push(t);
    }
  }

  const groupBlurb = snippets.length ? snippets.slice(0, 5).join(" · ").slice(0, 280) : "";
  const detailFromGroup = groupBlurb ? `From your group: ${groupBlurb}` : "Tailored from your trip setup";

  const restaurants: SeedOption[] = [];
  const pollsVenues = plan.polls?.venues ?? [];
  for (let i = 0; i < Math.min(3, pollsVenues.length); i++) {
    const name = pollsVenues[i]!.trim();
    if (!name) continue;
    restaurants.push({
      id: stableId("tail-rest", `${dateIso}|${name}`),
      label: name,
      detail: detailFromGroup,
      href: mapsSearchUrl(`${name} ${cityHead}`),
      suggestedBy: "conci:auto",
    });
  }
  if (restaurants.length === 0 && plan.vibe.length > 0) {
    const v = plan.vibe[0]!.trim();
    const label = `${v} dinner nearby`;
    restaurants.push({
      id: stableId("tail-rest", `${dateIso}|vibe-dinner`),
      label,
      detail: `${detailFromGroup} · ${loc}`,
      href: mapsSearchUrl(`${label} ${cityHead}`),
      suggestedBy: "conci:auto",
    });
  }

  const activities: SeedOption[] = [];
  const pollActs = plan.polls?.activities ?? [];
  for (let i = 0; i < Math.min(3, pollActs.length); i++) {
    const name = pollActs[i]!.trim();
    if (!name) continue;
    activities.push({
      id: stableId("tail-act", `${dateIso}|${name}`),
      label: name,
      detail: detailFromGroup,
      href: mapsSearchUrl(`${name} ${cityHead}`),
      suggestedBy: "conci:auto",
    });
  }
  if (activities.length === 0 && plan.vibe.length > 0) {
    const v = plan.vibe[0]!.trim();
    const label = `${v} experience`;
    activities.push({
      id: stableId("tail-act", `${dateIso}|vibe-act`),
      label,
      detail: `${detailFromGroup} · ${loc}`,
      href: mapsSearchUrl(`things to do ${v} ${cityHead}`),
      suggestedBy: "conci:auto",
    });
  }

  const hotels: SeedOption[] = [];
  if (!hasHotelStayForDay(plan, dateIso)) {
    if (plan.vibe[0]?.trim()) {
      const v = plan.vibe[0]!.trim();
      hotels.push({
        id: stableId("tail-hotel", `${dateIso}|vibe`),
        label: `Stay — ${v} vibes`,
        detail: detailFromGroup,
        href: mapsSearchUrl(`${v} boutique hotel ${cityHead}`),
        suggestedBy: "conci:auto",
      });
    }
    hotels.push({
      id: stableId("tail-hotel", `${dateIso}|boutique`),
      label: `Boutique stay · ${cityHead}`,
      detail: "Owner: add to trip for this night, or set lodging on the main calendar.",
      href: mapsSearchUrl(`boutique hotel ${cityHead}`),
      suggestedBy: "conci:auto",
    });
  }

  return { restaurants, hotels, flights: [], activities, other: [] };
}

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

function mergeCategoryLists(prior: DayVoteCategoryState, planSeeds: SeedOption[], tailoredSeeds: SeedOption[]): DayVoteCategoryState {
  const priorMap = new Map(prior.options.map((o) => [o.id, o]));
  const merged: DayVoteOption[] = [];
  const seenLabels = new Set<string>();

  const pushSeed = (s: SeedOption) => {
    const labelKey = s.label.trim().toLowerCase();
    if (seenLabels.has(labelKey)) return;
    const existing = priorMap.get(s.id);
    seenLabels.add(labelKey);
    const votes = existing?.votes ?? [];
    const downvotes = existing?.downvotes ?? [];
    merged.push({
      id: s.id,
      label: s.label,
      ...(s.detail ? { detail: s.detail } : {}),
      ...(s.href ? { href: s.href } : {}),
      ...(s.imageUrl ? { imageUrl: s.imageUrl } : {}),
      votes,
      ...(downvotes.length ? { downvotes } : {}),
      suggestedBy: s.suggestedBy ?? existing?.suggestedBy,
      ...(existing?.lockedDetail ? { lockedDetail: existing.lockedDetail } : {}),
      ...(existing?.lockedAt ? { lockedAt: existing.lockedAt } : {}),
      ...(existing?.lockedBy ? { lockedBy: existing.lockedBy } : {}),
    });
    priorMap.delete(s.id);
  };

  for (const s of planSeeds) pushSeed(s);
  for (const s of tailoredSeeds) pushSeed(s);
  for (const leftover of priorMap.values()) {
    const lk = leftover.label.trim().toLowerCase();
    if (seenLabels.has(lk)) continue;
    seenLabels.add(lk);
    merged.push(leftover);
  }

  return {
    options: merged,
    ...(prior.lockedOptionId ? { lockedOptionId: prior.lockedOptionId } : {}),
  };
}

export function mergeDayVoteStateForDate(
  plan: TripPlan,
  byDate: DayVoteStateByDate,
  dateIso: string,
  collabHints?: DayVoteCollabHints
): DayVoteStateByDate {
  const base = byDate[dateIso] ?? emptyState();
  const fromPlan = seedOptionsFromPlan(plan, dateIso);
  const tailored = seedTailoredFromGroupContext(plan, dateIso, collabHints);
  const next: DayVoteState = emptyState();
  for (const category of DAY_VOTE_CATEGORIES) {
    next[category] = mergeCategoryLists(base[category], fromPlan[category], tailored[category]);
  }
  return { ...byDate, [dateIso]: next };
}

