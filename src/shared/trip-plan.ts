import type { PlaceSpotlight } from "@/shared/place-preview";
import { parseItineraryLiveCuration, type ItineraryLiveCuration } from "@/shared/itinerary-live-curation";

/** Narrowed votes the app surfaced (≤3 options each). Omit or empty = no poll for that axis. */
export type TripPolls = {
  /** 2–3 destination names when torn between cities */
  destinations?: string[];
  /** 2–3 restaurant / venue short names */
  venues?: string[];
  /** 2–3 activity arcs, e.g. "Dinner-focused" vs "Bars" */
  activities?: string[];
  /** 2–3 vibe tiers, e.g. "Casual" / "Dressy" / "Mix of both" */
  vibePick?: string[];
  /** 2–3 price bands for the poll, e.g. "$ · ~$75" "$$ · ~$125" "$$$ · splash out" */
  budgetPick?: string[];
  /** 2–3 ways to converge, e.g. "Road trip together" / "Meet there / own flights" */
  transport?: string[];
};

const MAX_PLAN_TITLE_LEN = 120;

/** Always returns a non-empty string for UI and storage. */
export function guaranteedPlanTitle(
  title: string | null | undefined,
  location: string | null | undefined
): string {
  const t = (typeof title === "string" ? title : "").trim();
  if (t) return t.length > MAX_PLAN_TITLE_LEN ? `${t.slice(0, MAX_PLAN_TITLE_LEN - 1)}…` : t;
  const loc = (typeof location === "string" ? location : "").trim();
  if (loc) {
    const first = loc.split(",")[0]?.trim() || loc;
    return first.length > MAX_PLAN_TITLE_LEN ? `${first.slice(0, MAX_PLAN_TITLE_LEN - 1)}…` : first;
  }
  return "Your trip";
}

export type TripPlan = {
  title: string;
  location: string | null;
  /** City or metro travelers depart from (enables flight search when set). */
  departureCity: string | null;
  dates: { confirmed: boolean; options: string[] };
  people: { count: number | null; names: string[] };
  budget: { tier: string | null; perPerson: string | null };
  vibe: string[];
  openDecisions: string[];
  polls?: TripPolls;
  /** Named venues the user confirmed during chat (hotels, restaurants, activities). */
  spotlights?: PlaceSpotlight[];
  /**
   * Curated live rows (restaurants / experiences / flights): keys the group kept on the trip vs dismissed.
   * See `@/shared/itinerary-live-curation` for key format.
   */
  itineraryLiveCuration?: ItineraryLiveCuration;
  nextStep: string | null;
  confidence: number;
};

export const POLL_MAX_OPTIONS = 3;

function sanitizePollOptions(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const cleaned = [...new Set(raw.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean))].slice(
    0,
    POLL_MAX_OPTIONS
  );
  return cleaned.length >= 2 ? cleaned : undefined;
}

function normalizePolls(plan: Record<string, unknown>): TripPolls | undefined {
  const p =
    plan.polls && typeof plan.polls === "object"
      ? (plan.polls as Record<string, unknown>)
      : null;
  if (!p) return undefined;

  const out: TripPolls = {};
  const d = sanitizePollOptions(p.destinations);
  const v = sanitizePollOptions(p.venues);
  const a = sanitizePollOptions(p.activities);
  const vp = sanitizePollOptions(p.vibePick);
  const bp = sanitizePollOptions(p.budgetPick);
  const tr = sanitizePollOptions(p.transport);
  if (d) out.destinations = d;
  if (v) out.venues = v;
  if (a) out.activities = a;
  if (vp) out.vibePick = vp;
  if (bp) out.budgetPick = bp;
  if (tr) out.transport = tr;

  return Object.keys(out).length ? out : undefined;
}

function parseSpotlights(raw: unknown): PlaceSpotlight[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: PlaceSpotlight[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name) continue;
    const mapsUrl = typeof o.mapsUrl === "string" && o.mapsUrl.startsWith("http") ? o.mapsUrl : "";
    if (!mapsUrl) continue;
    out.push({
      name,
      mapsUrl,
      rating: typeof o.rating === "number" ? o.rating : undefined,
      reviewCount: typeof o.reviewCount === "number" ? o.reviewCount : undefined,
      address: typeof o.address === "string" ? o.address : undefined,
      priceRange: typeof o.priceRange === "string" ? o.priceRange : undefined,
      photoUrl: typeof o.photoUrl === "string" ? o.photoUrl : null,
      sourceQuery: typeof o.sourceQuery === "string" ? o.sourceQuery : undefined,
    });
  }
  return out.length ? out : undefined;
}

export function safeParseJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Parser returned empty content.");
  }

  const tryParse = (s: string): unknown | undefined => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };

  const direct = tryParse(trimmed);
  if (direct !== undefined) return direct;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const fromFence = tryParse(fenced[1].trim());
    if (fromFence !== undefined) return fromFence;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const fromBraces = tryParse(trimmed.slice(firstBrace, lastBrace + 1));
    if (fromBraces !== undefined) return fromBraces;
  }

  throw new Error("Parser did not return valid JSON.");
}

/**
 * Drops `people.names` entries the model invented: keeps a name only if it appears
 * as a substring of the user's original message (case-insensitive).
 */
export function retainPeopleNamesOnlyIfMentionedInInput(plan: TripPlan, userInput: string): TripPlan {
  const seed = userInput.trim().toLowerCase();
  if (!seed) {
    return { ...plan, people: { ...plan.people, names: [] } };
  }
  const kept = plan.people.names.filter((name) => {
    const n = name.trim().toLowerCase();
    return n.length > 0 && seed.includes(n);
  });
  return { ...plan, people: { ...plan.people, names: kept } };
}

export function normalizePlan(value: unknown): TripPlan {
  const plan = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const people =
    plan.people && typeof plan.people === "object"
      ? (plan.people as Record<string, unknown>)
      : {};
  const dates =
    plan.dates && typeof plan.dates === "object"
      ? (plan.dates as Record<string, unknown>)
      : {};
  const budget =
    plan.budget && typeof plan.budget === "object"
      ? (plan.budget as Record<string, unknown>)
      : {};

  const location = typeof plan.location === "string" ? plan.location : null;
  const titleRaw = typeof plan.title === "string" ? plan.title : null;

  return {
    title: guaranteedPlanTitle(titleRaw, location),
    location,
    departureCity: typeof plan.departureCity === "string" ? plan.departureCity.trim() || null : null,
    dates: {
      confirmed: typeof dates.confirmed === "boolean" ? dates.confirmed : false,
      options: Array.isArray(dates.options)
        ? [...new Set(dates.options.filter((d) => typeof d === "string"))].slice(0, POLL_MAX_OPTIONS)
        : [],
    },
    people: {
      count: typeof people.count === "number" ? people.count : null,
      names: Array.isArray(people.names) ? people.names.filter((n) => typeof n === "string") : [],
    },
    budget: {
      tier: typeof budget.tier === "string" ? budget.tier : null,
      perPerson: typeof budget.perPerson === "string" ? budget.perPerson : null,
    },
    vibe: Array.isArray(plan.vibe) ? plan.vibe.filter((v) => typeof v === "string") : [],
    openDecisions: Array.isArray(plan.openDecisions)
      ? plan.openDecisions.filter((d) => typeof d === "string")
      : [],
    polls: normalizePolls(plan),
    spotlights: parseSpotlights(plan.spotlights),
    itineraryLiveCuration: parseItineraryLiveCuration(plan.itineraryLiveCuration),
    nextStep: typeof plan.nextStep === "string" ? plan.nextStep : null,
    confidence: typeof plan.confidence === "number" ? Math.max(0, Math.min(1, plan.confidence)) : 0,
  };
}

export function isLocationVague(location: string | null): boolean {
  const loc = location?.trim() ?? "";
  if (loc.length === 0) return true;
  if (loc.length < 3) return true;
  return /\b(tbd|somewhere|anywhere|not sure|maybe|idk)\b/i.test(loc);
}

const VENUE_OR_PLACE_FOLLOWUP = /restaurant|hotel|lodging|where to eat|dinner reservation|brunch spot|café|cafe|stay at|accommodation/i;

export function followUpPromptsForPlan(
  plan: TripPlan,
  ctx?: { hadNamedPlaceMentions?: boolean }
): string[] {
  type Candidate = { priority: number; label: string };
  const candidates: Candidate[] = [];

  if (isLocationVague(plan.location)) {
    candidates.push({
      priority: 1,
      label: "Any specific neighborhood or area we should focus on?",
    });
  }

  if (plan.dates.options.length === 0) {
    candidates.push({ priority: 2, label: "When are you thinking of going?" });
  }

  const budgetMissing =
    (plan.budget.tier == null || plan.budget.tier.trim() === "") &&
    (plan.budget.perPerson == null || plan.budget.perPerson.trim() === "");
  if (budgetMissing) {
    candidates.push({ priority: 3, label: "What's your budget per person?" });
  }

  if (plan.people.count == null) {
    candidates.push({ priority: 4, label: "How many people are coming?" });
  }

  if (plan.vibe.length === 0) {
    candidates.push({
      priority: 5,
      label: "What's the vibe—party, relaxing, culture?",
    });
  }

  candidates.sort((a, b) => a.priority - b.priority);
  let labels = candidates.map((c) => c.label);
  if (!ctx?.hadNamedPlaceMentions) {
    labels = labels.filter((label) => !VENUE_OR_PLACE_FOLLOWUP.test(label));
  }
  return Array.from(new Set(labels)).slice(0, 3);
}

/** Stored in `plan.dates.options` when the creator picks “TBD” during trip creation. */
export const DATE_OPTION_TBD = "TBD — host will confirm later";

export function isDatesSlotTbdValue(slotText: string): boolean {
  const v = slotText.trim();
  return v === DATE_OPTION_TBD || /^TBD\b/i.test(v);
}

/** Apply the chat “dates” slot answer onto the plan (overrides model dates for this flow). */
export function applyDatesSlotToPlan(plan: TripPlan, datesSlotText: string): TripPlan {
  const v = datesSlotText.trim();
  if (!v) return plan;
  if (isDatesSlotTbdValue(v)) {
    return { ...plan, dates: { confirmed: false, options: [DATE_OPTION_TBD] } };
  }
  const line = v.length > 200 ? `${v.slice(0, 197)}…` : v;
  return { ...plan, dates: { confirmed: false, options: [line] } };
}

/**
 * Busts live recommendation caches and triggers client refetch when inputs to Serp/OpenTable/etc. change.
 * Intentionally excludes title / nextStep / openDecisions so cosmetic copy edits do not wipe picks.
 */
export function tripLiveRecommendationsContextFingerprint(plan: TripPlan): string {
  return JSON.stringify({
    location: plan.location,
    departureCity: plan.departureCity,
    dates: plan.dates.options,
    datesConfirmed: plan.dates.confirmed,
    peopleCount: plan.people.count,
    budgetTier: plan.budget.tier,
    budgetPerPerson: plan.budget.perPerson,
    vibe: plan.vibe,
    venues: plan.polls?.venues ?? [],
  });
}

/** Full snapshot for “did the persisted plan change after chat merge?” */
export function tripPlanPersistenceFingerprint(plan: TripPlan): string {
  return JSON.stringify({
    title: plan.title,
    location: plan.location,
    departureCity: plan.departureCity,
    dates: plan.dates,
    people: plan.people,
    budget: plan.budget,
    vibe: plan.vibe,
    openDecisions: plan.openDecisions,
    polls: plan.polls ?? null,
    nextStep: plan.nextStep,
    confidence: plan.confidence,
    spotlights: plan.spotlights?.map((s) => s.mapsUrl) ?? [],
    itineraryLiveCuration: plan.itineraryLiveCuration ?? null,
  });
}

/**
 * Merge a partial plan object from NLU (trip card chat). Only keys present on `patch` are applied.
 * Ignores `spotlights` / `itineraryLiveCuration` so chat cannot overwrite structured picks via JSON.
 */
export function applyTripPlanChatPatch(base: TripPlan, patch: unknown): TripPlan {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return base;
  }
  const p = patch as Record<string, unknown>;
  if (Object.keys(p).length === 0) return base;

  const merged: Record<string, unknown> = { ...(base as unknown as Record<string, unknown>) };

  if (typeof p.title === "string") merged.title = p.title;
  if ("location" in p) {
    merged.location = typeof p.location === "string" ? p.location.trim() || null : null;
  }
  if ("departureCity" in p) {
    merged.departureCity =
      typeof p.departureCity === "string" ? p.departureCity.trim() || null : p.departureCity === null ? null : base.departureCity;
  }

  if (p.dates && typeof p.dates === "object" && !Array.isArray(p.dates)) {
    const d = p.dates as Record<string, unknown>;
    const prev = (merged.dates as Record<string, unknown>) ?? {};
    merged.dates = {
      ...prev,
      ...(typeof d.confirmed === "boolean" ? { confirmed: d.confirmed } : {}),
      ...(Array.isArray(d.options) ? { options: d.options } : {}),
    };
  }

  if (p.people && typeof p.people === "object" && !Array.isArray(p.people)) {
    const pe = p.people as Record<string, unknown>;
    const prev = (merged.people as Record<string, unknown>) ?? {};
    const next: Record<string, unknown> = { ...prev };
    if ("count" in pe) {
      next.count = typeof pe.count === "number" && Number.isFinite(pe.count) ? Math.round(pe.count) : pe.count === null ? null : prev.count;
    }
    if (Array.isArray(pe.names)) {
      next.names = pe.names.filter((n): n is string => typeof n === "string");
    }
    merged.people = next;
  }

  if (p.budget && typeof p.budget === "object" && !Array.isArray(p.budget)) {
    const b = p.budget as Record<string, unknown>;
    const prev = (merged.budget as Record<string, unknown>) ?? {};
    merged.budget = {
      ...prev,
      ...(typeof b.tier === "string" ? { tier: b.tier.trim() || null } : b.tier === null ? { tier: null } : {}),
      ...(typeof b.perPerson === "string"
        ? { perPerson: b.perPerson.trim() || null }
        : b.perPerson === null
          ? { perPerson: null }
          : {}),
    };
  }

  if (Array.isArray(p.vibe)) {
    merged.vibe = p.vibe.filter((v): v is string => typeof v === "string");
  }

  if (Array.isArray(p.openDecisions)) {
    merged.openDecisions = p.openDecisions.filter((d): d is string => typeof d === "string");
  }

  if (typeof p.nextStep === "string") merged.nextStep = p.nextStep.trim() || null;
  if (typeof p.confidence === "number" && Number.isFinite(p.confidence)) {
    merged.confidence = Math.max(0, Math.min(1, p.confidence));
  }

  if (p.polls && typeof p.polls === "object" && !Array.isArray(p.polls)) {
    const prevPolls =
      merged.polls && typeof merged.polls === "object" && !Array.isArray(merged.polls)
        ? (merged.polls as Record<string, unknown>)
        : {};
    merged.polls = { ...prevPolls, ...(p.polls as Record<string, unknown>) };
  }

  return normalizePlan(merged);
}
