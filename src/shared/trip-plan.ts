import type { PlaceSpotlight, SpotlightVenueKind } from "@/shared/place-preview";
import {
  formatLocalIsoDate,
  inferDefaultYearFromDateOptions,
  localDayTime,
  looseDateOptionOverlapsUserText,
  parseConcreteDateOptionToRange,
  parseDateOptionToRange,
  startOfLocalDay,
} from "@/shared/date-option-parse";
import { parseItineraryLiveCuration, type ItineraryLiveCuration } from "@/shared/itinerary-live-curation";
import { isKnownAliasExpansion } from "@/shared/location-aliases";

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

/** Pins for host pre-publish setup (calendar restaurants). */
export type HostRestaurantPin = {
  dateIso: string;
  place: PlaceSpotlight;
  /** When false the host removed this suggestion for that day. */
  kept: boolean;
  /** Auto-seeded recommendation provenance (subtle badge in UI). */
  recommendedByConci?: boolean;
};

/** Serialized experience row (matches `LiveExperienceCard` from live recommendations). */
export type HostActivityExperience = {
  name: string;
  pricePerPerson: string;
  rating: string;
  duration: string;
  bookingUrl: string;
  coverPhotoUrl?: string | null;
};

export type HostActivityPin = {
  dateIso: string;
  experience: HostActivityExperience;
  kept: boolean;
  /** Auto-seeded recommendation provenance (subtle badge in UI). */
  recommendedByConci?: boolean;
};

/** Inclusive lodging segment (host may split stays across the trip). */
export type HostHotelStay = {
  startIso: string;
  endIso: string;
  place: PlaceSpotlight;
  /** Auto-seeded recommendation provenance (subtle badge in UI). */
  recommendedByConci?: boolean;
};

/**
 * Persisted while `trip_plans.status === 'draft'`: concrete range, hotel, restaurant pins before invite is minted.
 */
export type HostSetupState = {
  tripRange?: { startIso: string; endIso: string } | null;
  restaurantPins?: HostRestaurantPin[];
  activityPins?: HostActivityPin[];
  hotel?: PlaceSpotlight | null;
  /** Segmented stays when the trip uses more than one property (calendar pick + scope). */
  hotelStays?: HostHotelStay[];
  /** Host-authored packing list notes (draft). */
  packingList?: string;
  /** Optional UX flag for completion meter only (does not gate publish). */
  experiencesOutlined?: boolean;
};

export type ItineraryActivity = {
  time: string;
  title: string;
  description: string;
  category: "transport" | "food" | "activity" | "lodging" | "free-time";
  estimatedCostPp: number | null;
  bookingUrl?: string | null;
};

export type ItineraryDay = {
  dateIso: string;
  label: string;
  activities: ItineraryActivity[];
  estimatedDayCostPp: number | null;
};

export type GeneratedItinerary = {
  days: ItineraryDay[];
  totalEstimatePp: number | null;
  totalEstimateGroup: number | null;
  generatedAt: string;
};

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
  /** Host dashboard state (draft trips). */
  hostSetup?: HostSetupState;
  /**
   * Curated live rows (restaurants / experiences / flights): keys the group kept on the trip vs dismissed.
   * See `@/shared/itinerary-live-curation` for key format.
   */
  itineraryLiveCuration?: ItineraryLiveCuration;
  /** AI-generated day-by-day itinerary with cost estimates. */
  generatedItinerary?: GeneratedItinerary;
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

export function experienceToSpotlight(e: HostActivityExperience): PlaceSpotlight | null {
  const mapsUrl = typeof e.bookingUrl === "string" ? e.bookingUrl.trim() : "";
  if (!mapsUrl.startsWith("http")) return null;
  const name = typeof e.name === "string" ? e.name.trim() : "";
  const ratingMatch = typeof e.rating === "string" ? e.rating.match(/^(\d+(?:\.\d+)?)/) : null;
  const rating = ratingMatch ? parseFloat(ratingMatch[1]!) : undefined;
  return {
    name: name || "Activity",
    mapsUrl,
    rating: Number.isFinite(rating) ? rating : undefined,
    priceRange: typeof e.pricePerPerson === "string" ? e.pricePerPerson : undefined,
    photoUrl: typeof e.coverPhotoUrl === "string" && e.coverPhotoUrl.startsWith("http") ? e.coverPhotoUrl : null,
    spotlightCategory: "experience",
  };
}

export function spotlightFromUnknown(row: unknown): PlaceSpotlight | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name) return null;
  const mapsUrl = typeof o.mapsUrl === "string" && o.mapsUrl.startsWith("http") ? o.mapsUrl : "";
  if (!mapsUrl) return null;
  let spotlightCategory: SpotlightVenueKind | undefined;
  const cat = o.spotlightCategory;
  if (cat === "hotel" || cat === "restaurant" || cat === "experience") spotlightCategory = cat;

  return {
    name,
    mapsUrl,
    rating: typeof o.rating === "number" ? o.rating : undefined,
    reviewCount: typeof o.reviewCount === "number" ? o.reviewCount : undefined,
    address: typeof o.address === "string" ? o.address : undefined,
    priceRange: typeof o.priceRange === "string" ? o.priceRange : undefined,
    photoUrl: typeof o.photoUrl === "string" ? o.photoUrl : null,
    sourceQuery: typeof o.sourceQuery === "string" ? o.sourceQuery : undefined,
    ...(spotlightCategory ? { spotlightCategory } : {}),
  };
}

export function parseHostSetup(raw: unknown): HostSetupState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const h = raw as Record<string, unknown>;
  let tripRange: { startIso: string; endIso: string } | null | undefined;
  const tr = h.tripRange;
  if (tr === null) {
    tripRange = null;
  } else if (tr && typeof tr === "object") {
    const o = tr as Record<string, unknown>;
    const startIso = typeof o.startIso === "string" ? o.startIso : "";
    const endIso = typeof o.endIso === "string" ? o.endIso : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(startIso) && /^\d{4}-\d{2}-\d{2}$/.test(endIso)) {
      tripRange = { startIso, endIso };
    }
  }

  let hotel: PlaceSpotlight | null | undefined;
  if (h.hotel === null) hotel = null;
  else hotel = spotlightFromUnknown(h.hotel) ?? undefined;

  const pinsRaw = h.restaurantPins;
  let restaurantPins: HostRestaurantPin[] | undefined;
  if (Array.isArray(pinsRaw) && pinsRaw.length) {
    const pins: HostRestaurantPin[] = [];
    for (const row of pinsRaw) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const dateIso = typeof o.dateIso === "string" ? o.dateIso.trim() : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) continue;
      const place = spotlightFromUnknown(o.place);
      if (!place) continue;
      const kept = typeof o.kept === "boolean" ? o.kept : true;
      const recommendedByConci = o.recommendedByConci === true;
      pins.push({ dateIso, place, kept, ...(recommendedByConci ? { recommendedByConci: true } : {}) });
    }
    if (pins.length) restaurantPins = pins;
  }

  const actRaw = h.activityPins;
  let activityPins: HostActivityPin[] | undefined;
  if (Array.isArray(actRaw) && actRaw.length) {
    const pins: HostActivityPin[] = [];
    for (const row of actRaw) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const dateIso = typeof o.dateIso === "string" ? o.dateIso.trim() : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) continue;
      const ex = o.experience;
      if (!ex || typeof ex !== "object") continue;
      const e = ex as Record<string, unknown>;
      const name = typeof e.name === "string" ? e.name.trim().slice(0, 200) : "";
      const bookingUrl = typeof e.bookingUrl === "string" ? e.bookingUrl.trim() : "";
      if (!name || !bookingUrl.startsWith("http")) continue;
      const experience: HostActivityExperience = {
        name,
        pricePerPerson: typeof e.pricePerPerson === "string" ? e.pricePerPerson : "",
        rating: typeof e.rating === "string" ? e.rating : "",
        duration: typeof e.duration === "string" ? e.duration : "",
        bookingUrl,
        coverPhotoUrl:
          typeof e.coverPhotoUrl === "string" && e.coverPhotoUrl.startsWith("http")
            ? e.coverPhotoUrl
            : e.coverPhotoUrl === null
              ? null
              : undefined,
      };
      const kept = typeof o.kept === "boolean" ? o.kept : true;
      const recommendedByConci = o.recommendedByConci === true;
      pins.push({ dateIso, experience, kept, ...(recommendedByConci ? { recommendedByConci: true } : {}) });
    }
    if (pins.length) activityPins = pins;
  }

  const experiencesOutlined = typeof h.experiencesOutlined === "boolean" ? h.experiencesOutlined : undefined;

  const staysRaw = h.hotelStays;
  let hotelStays: HostHotelStay[] | undefined;
  if (Array.isArray(staysRaw) && staysRaw.length) {
    const list: HostHotelStay[] = [];
    for (const row of staysRaw) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const startIso = typeof o.startIso === "string" ? o.startIso.trim() : "";
      const endIso = typeof o.endIso === "string" ? o.endIso.trim() : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso) || !/^\d{4}-\d{2}-\d{2}$/.test(endIso)) continue;
      const place = spotlightFromUnknown(o.place);
      if (!place) continue;
      const recommendedByConci = o.recommendedByConci === true;
      if (startIso <= endIso) {
        list.push({ startIso, endIso, place, ...(recommendedByConci ? { recommendedByConci: true } : {}) });
      }
    }
    if (list.length) hotelStays = list;
  }

  const packingRaw = h.packingList;
  const packingList =
    typeof packingRaw === "string" ? packingRaw.slice(0, 20000) : undefined;

  const any =
    tripRange !== undefined ||
    restaurantPins ||
    activityPins ||
    hotel !== undefined ||
    experiencesOutlined !== undefined ||
    hotelStays !== undefined ||
    packingList !== undefined;
  if (!any) return undefined;

  const out: HostSetupState = {};
  if (tripRange !== undefined) out.tripRange = tripRange;
  if (restaurantPins) out.restaurantPins = restaurantPins;
  if (activityPins) out.activityPins = activityPins;
  if (hotel !== undefined) out.hotel = hotel ?? null;
  if (experiencesOutlined !== undefined) out.experiencesOutlined = experiencesOutlined;
  if (hotelStays !== undefined) out.hotelStays = hotelStays;
  if (packingList !== undefined) out.packingList = packingList;

  return out;
}

function parseSpotlights(raw: unknown): PlaceSpotlight[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: PlaceSpotlight[] = [];
  for (const row of raw) {
    const one = spotlightFromUnknown(row);
    if (one) out.push(one);
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

const IMAGE_INPUT_PLACEHOLDERS = /\[images?\s+attached\]|\[image\]/gi;

const GROUND_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "are",
  "but",
  "not",
  "you",
  "all",
  "can",
  "her",
  "was",
  "one",
  "our",
  "out",
  "day",
  "per",
  "mix",
  "trip",
  "week",
  "stay",
  "nice",
  "food",
  "wine",
  "bars",
  "bar",
  "city",
  "town",
  "spot",
  "hotel",
  "area",
  "outdoors",
  "culture",
]);

/**
 * Naive English suffix stripping for grounding comparisons.
 * Not a full stemmer — just handles the most common morphological variants
 * that cause false negatives (e.g. "beachy" vs "beach", "partying" vs "party").
 */
function roughStem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ying")) return word.slice(0, -4) + "y";
  if (word.endsWith("ing")) return word.slice(0, -3);
  if (word.endsWith("tion")) return word.slice(0, -4) + "te";
  if (word.endsWith("ness")) return word.slice(0, -4);
  if (word.endsWith("ful")) return word.slice(0, -3);
  if (word.endsWith("ous")) return word.slice(0, -3);
  if (word.endsWith("ive")) return word.slice(0, -3);
  if (word.endsWith("ly")) return word.slice(0, -2);
  if (word.endsWith("ed")) return word.slice(0, -2);
  if (word.endsWith("er")) return word.slice(0, -2);
  if (word.endsWith("es")) return word.slice(0, -2);
  if (word.endsWith("sy")) return word.slice(0, -1);
  if (word.endsWith("y") && word.length > 4) return word.slice(0, -1);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function stemMatchInText(word: string, text: string): boolean {
  if (text.includes(word)) return true;
  const stemmed = roughStem(word);
  if (stemmed !== word && stemmed.length >= 3 && text.includes(stemmed)) return true;
  const textWords = text.match(/[a-z0-9']+/g) ?? [];
  return textWords.some((tw) => {
    if (tw === word) return true;
    const twStem = roughStem(tw);
    return (twStem === stemmed || twStem === word || tw === stemmed) && stemmed.length >= 3;
  });
}

/**
 * True if a poll option, vibe tag, or short label plausibly comes from the user's message
 * (substring, money tokens, or all significant tokens present with stemming). Used to drop model hallucinations.
 */
export function textChunkMentionedInUserInput(chunk: string, userLower: string): boolean {
  const c = chunk.trim().toLowerCase();
  if (!c || !userLower.trim()) return false;
  if (userLower.includes(c)) return true;

  const moneyNums = c.match(/(?:\$?\s*)([\d,]+(?:\.\d{1,2})?)/g);
  if (moneyNums) {
    for (const m of moneyNums) {
      const n = m.replace(/[$,\s]/g, "");
      if (n.length > 0 && userLower.includes(n)) return true;
    }
  }

  const words = c.match(/[a-z0-9']+/gi) ?? [];
  const significant = words
    .map((w) => w.toLowerCase())
    .filter((w) => w.length >= 2 && !GROUND_STOPWORDS.has(w));
  if (significant.length === 0) return false;
  return significant.every((w) => stemMatchInText(w, userLower));
}

function budgetFieldsGroundedInUserInput(
  budget: TripPlan["budget"],
  userLower: string
): boolean {
  if (budget.tier?.trim() && textChunkMentionedInUserInput(budget.tier.trim(), userLower)) return true;
  if (budget.perPerson?.trim()) {
    const p = budget.perPerson.trim().toLowerCase();
    if (userLower.includes(p)) return true;
    const nums = budget.perPerson.match(/\d[\d,.]*/g);
    if (nums?.some((d) => userLower.includes(d.replace(/,/g, "")))) return true;
  }
  return /\$\s*\d|\d\s*\$|budget|splurge|cheap|expensive|afford|bucks|usd|\bpp\b|per\s*person|per\s*night/i.test(
    userLower
  );
}

function filterDatesOptionsByUserText(options: string[], userLower: string): string[] {
  return options.filter((o) => {
    const t = o.trim().toLowerCase();
    if (!t) return false;
    if (userLower.includes(t)) return true;
    if (textChunkMentionedInUserInput(o, userLower)) return true;
    return looseDateOptionOverlapsUserText(o, userLower);
  });
}

function filterPollsByUserText(polls: TripPolls | undefined, userLower: string): TripPolls | undefined {
  if (!polls) return undefined;
  const out: TripPolls = {};
  (["destinations", "venues", "activities", "vibePick", "budgetPick", "transport"] as const).forEach((key) => {
    const arr = polls[key];
    if (!Array.isArray(arr)) return;
    const filt = arr.filter((opt) => textChunkMentionedInUserInput(opt, userLower));
    const kept = filt.length >= 2 ? [...new Set(filt)].slice(0, POLL_MAX_OPTIONS) : undefined;
    if (kept) out[key] = kept;
  });
  return Object.keys(out).length ? out : undefined;
}

export type GroundPlanInUserInputOptions = {
  /** When merging onto a saved trip (e.g. card chat), keep stored spotlights. Initial parser clears model hallucinations. */
  preserveSpotlights?: boolean;
};

/**
 * After normalize + name retention: drop fields the model invented that do not appear in the user's text.
 * Skips aggressive filtering when there is no real user prose (e.g. image-only stub).
 * By default clears model-authored spotlights; set preserveSpotlights when patching an existing plan.
 */
export function groundPlanInUserInput(
  plan: TripPlan,
  userInput: string,
  opts?: GroundPlanInUserInputOptions
): TripPlan {
  const preserveSpotlights = opts?.preserveSpotlights === true;
  const effective = userInput.replace(IMAGE_INPUT_PLACEHOLDERS, " ").replace(/\s+/g, " ").trim();
  if (effective.length < 2) {
    return preserveSpotlights ? plan : { ...plan, spotlights: undefined };
  }

  const userLower = effective.toLowerCase();

  const next: TripPlan = preserveSpotlights
    ? { ...plan }
    : { ...plan, spotlights: undefined };

  if (next.location?.trim()) {
    const loc = next.location.trim();
    const head = loc.split(",")[0]?.trim() ?? loc;
    if (
      !textChunkMentionedInUserInput(head, userLower) &&
      !textChunkMentionedInUserInput(loc, userLower) &&
      !isKnownAliasExpansion(loc, userLower)
    ) {
      next.location = null;
    }
  }

  if (next.departureCity?.trim()) {
    const dc = next.departureCity.trim();
    const head = dc.split(",")[0]?.trim() ?? dc;
    if (
      !textChunkMentionedInUserInput(head, userLower) &&
      !textChunkMentionedInUserInput(dc, userLower) &&
      !isKnownAliasExpansion(dc, userLower)
    ) {
      next.departureCity = null;
    }
  }

  next.dates = {
    ...next.dates,
    options: filterDatesOptionsByUserText(next.dates.options, userLower),
  };

  if (!budgetFieldsGroundedInUserInput(next.budget, userLower)) {
    next.budget = { tier: null, perPerson: null };
  }

  next.vibe = next.vibe.filter((v) => textChunkMentionedInUserInput(v, userLower));

  next.openDecisions = next.openDecisions.filter((d) => textChunkMentionedInUserInput(d, userLower));

  next.polls = filterPollsByUserText(next.polls, userLower);

  if (next.nextStep?.trim()) {
    const ns = next.nextStep.trim();
    if (
      /\bshare\b.*\blink\b|\bgroup votes\b|\bcuration\b|\bpoll\b/i.test(ns) &&
      !/\bshare\b|\bvotes?\b|\bpoll\b|\bcurated\b/i.test(userLower)
    ) {
      next.nextStep = null;
    }
  }

  next.title = guaranteedPlanTitle(next.title, next.location);
  return next;
}

/** Legacy sentinel from flows that deferred dates entirely; stripped on normalize and rejected for new saves. */
export const DATE_OPTION_TBD = "TBD — host will confirm later";

export function isDatesSlotTbdValue(slotText: string): boolean {
  const v = slotText.trim();
  return v === DATE_OPTION_TBD || /^TBD\b/i.test(v);
}

/** At least one non-placeholder date hint (exact days or vague window). */
export function planHasUsableTripTiming(plan: TripPlan): boolean {
  return plan.dates.options.some((o) => {
    const t = o.trim();
    return t.length > 0 && !isDatesSlotTbdValue(t);
  });
}

/** True when the original trip-parser message plausibly asked for dining (auto-seed calendar meal pins). */
const DINING_PROMPT_HINT = /\b(restaurant|restaurants|dinner|lunch|brunch|breakfast|eat|eating|food|meal|meals|dining|cuisine|cafe|café|bistro|where to eat|places to eat|reservation|bars?\s+hop)\b/i;

export function seedTextMentionsDining(seedText: string | null | undefined): boolean {
  if (typeof seedText !== "string") return false;
  const s = seedText.trim();
  if (s.length < 2) return false;
  return DINING_PROMPT_HINT.test(s);
}

function pad2(n: number): string {
  return `${Math.trunc(n)}`.padStart(2, "0");
}

/** Calendar month index 0–11 from leading token (“jan”, “july”, …). */
function monthNameTokenToIndex(raw: string): number | null {
  const map: Record<string, number> = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
  };
  const key = raw.toLowerCase().replace(/\./g, "").trim();
  return map[key] ?? null;
}

function isoFromUtcParts(y: number, monthIdx0: number, day: number): string | null {
  if (y < 1990 || y > 2120 || monthIdx0 < 0 || monthIdx0 > 11 || day < 1 || !Number.isFinite(day)) return null;
  const dim = new Date(Date.UTC(y, monthIdx0 + 1, 0)).getUTCDate();
  if (day > dim) return null;
  return `${y}-${pad2(monthIdx0 + 1)}-${pad2(day)}`;
}

function sortedIsoPair(a: string, b: string): { startIso: string; endIso: string } {
  return a <= b ? { startIso: a, endIso: b } : { startIso: b, endIso: a };
}

function tryIsoBracketRange(chunk: string): { startIso: string; endIso: string } | null {
  const withKw =
    /\b(\d{4}-\d{2}-\d{2})\b\s*(?:to|through|thru|until|→)\s*\b(\d{4}-\d{2}-\d{2})\b/i.exec(chunk);
  if (withKw?.[1] && withKw[2]) return sortedIsoPair(withKw[1], withKw[2]);
  const hyphenOnly = /\b(\d{4}-\d{2}-\d{2})\b\s*[–\-—]\s*\b(\d{4}-\d{2}-\d{2})\b/.exec(chunk);
  if (hyphenOnly?.[1] && hyphenOnly[2]) return sortedIsoPair(hyphenOnly[1], hyphenOnly[2]);
  return null;
}

/** Interpret as US month/day/year. */
function trySlashBracketRange(chunk: string): { startIso: string; endIso: string } | null {
  const withKw =
    /\b(\d{1,2})[/](\d{1,2})[/](\d{4})\s*(?:to|through|thru|until|→)\s*(\d{1,2})[/](\d{1,2})[/](\d{4})\b/i.exec(
      chunk
    );
  if (withKw?.[6]) {
    const y1 = Number(withKw[3]);
    const m1 = Number(withKw[1]);
    const d1 = Number(withKw[2]);
    const y2 = Number(withKw[6]);
    const m2 = Number(withKw[4]);
    const d2 = Number(withKw[5]);
    if (
      ![m1, d1, y1, m2, d2, y2].every((n) => Number.isFinite(n) && n >= 0) ||
      y1 !== y2 ||
      m1 < 1 ||
      m1 > 12 ||
      m2 < 1 ||
      m2 > 12
    ) {
      return null;
    }
    const a = isoFromUtcParts(y1, m1 - 1, d1);
    const b = isoFromUtcParts(y2, m2 - 1, d2);
    if (!a || !b) return null;
    return sortedIsoPair(a, b);
  }
  const hyphenOnly =
    /\b(\d{1,2})[/](\d{1,2})[/](\d{4})\s*[–\-—]\s*(\d{1,2})[/](\d{1,2})[/](\d{4})\b/.exec(chunk);
  if (hyphenOnly?.[6]) {
    const y1 = Number(hyphenOnly[3]);
    const m1 = Number(hyphenOnly[1]);
    const d1 = Number(hyphenOnly[2]);
    const y2 = Number(hyphenOnly[6]);
    const m2 = Number(hyphenOnly[4]);
    const d2 = Number(hyphenOnly[5]);
    if (
      ![m1, d1, y1, m2, d2, y2].every((n) => Number.isFinite(n) && n >= 0) ||
      y1 !== y2 ||
      m1 < 1 ||
      m1 > 12 ||
      m2 < 1 ||
      m2 > 12
    ) {
      return null;
    }
    const a = isoFromUtcParts(y1, m1 - 1, d1);
    const b = isoFromUtcParts(y2, m2 - 1, d2);
    if (!a || !b) return null;
    return sortedIsoPair(a, b);
  }
  return null;
}

/** e.g. "July 10–24, 2026" or "June 14 — 28, 2026" — same-month window only (common in trip chat). */
function tryNamedMonthDayRange(chunk: string): { startIso: string; endIso: string } | null {
  const re =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})(?:,?|\s+)(\d{4})\b/i.exec(
      chunk
    );
  if (!re?.[4]) return null;
  const mi = monthNameTokenToIndex(re[1]);
  if (mi == null) return null;
  const y = Number(re[4]);
  let d1 = Number(re[2]);
  let d2 = Number(re[3]);
  if (!Number.isFinite(y) || !Number.isFinite(d1) || !Number.isFinite(d2)) return null;
  if (d1 > d2) [d1, d2] = [d2, d1];
  const a = isoFromUtcParts(y, mi, d1);
  const b = isoFromUtcParts(y, mi, d2);
  if (!a || !b) return null;
  return sortedIsoPair(a, b);
}

/** e.g. "Jul 30 to Aug 3, 2026" (cross-month explicit window). */
function tryNamedCrossMonthDayRange(chunk: string): { startIso: string; endIso: string } | null {
  const re =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\s*(?:-|–|—|to|through|thru|until|→)\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,?|\s+)(\d{4})\b/i.exec(
      chunk
    );
  if (!re?.[5]) return null;
  const m1 = monthNameTokenToIndex(re[1]);
  const m2 = monthNameTokenToIndex(re[3]);
  if (m1 == null || m2 == null) return null;
  const y = Number(re[5]);
  const d1 = Number(re[2]);
  const d2 = Number(re[4]);
  if (!Number.isFinite(y) || !Number.isFinite(d1) || !Number.isFinite(d2)) return null;
  const a = isoFromUtcParts(y, m1, d1);
  const b = isoFromUtcParts(y, m2, d2);
  if (!a || !b) return null;
  return sortedIsoPair(a, b);
}

/**
 * Replace model `dates.options` when your own words clearly state one contiguous span.
 * Prefer `• dates: …` lines from the composed finalize prompt over generic trip seed text so we avoid
 * random ISO-like numbers elsewhere (passport years, budgets, …).
 *
 * Typical failure mode: rebuild JSON emits "2026-07-01 … 2026-07-31" for any "July …" trip; this snaps back
 * to the concrete range you typed.
 */
export function applyUserAnchoredTripDates(plan: TripPlan, userCorpus: string): TripPlan {
  const corpus = userCorpus.trim();
  if (corpus.length < 10) return plan;

  const lines = corpus.split(/\r?\n/).map((l) => l.trim());
  /** Chip answers restate dates most reliably (see composeTripPrompt). */
  const dateBullets = lines.filter((l) => /^•\s*dates\s*:/i.test(l));

  const scopes = [...(dateBullets.length > 0 ? dateBullets : []), corpus];
  const tryAll = (): { startIso: string; endIso: string } | null => {
    for (const scope of scopes) {
      const r =
        tryIsoBracketRange(scope) ||
        trySlashBracketRange(scope) ||
        tryNamedCrossMonthDayRange(scope) ||
        tryNamedMonthDayRange(scope);
      if (r) return r;
    }
    return null;
  };

  const ranged = tryAll();
  if (!ranged) return plan;

  return {
    ...plan,
    dates: { confirmed: true, options: [`${ranged.startIso} to ${ranged.endIso}`] },
  };
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
        ? [
            ...new Set(
              dates.options
                .filter((d): d is string => typeof d === "string")
                .map((d) => d.trim())
                .filter((d) => d.length > 0 && !isDatesSlotTbdValue(d))
            ),
          ].slice(0, POLL_MAX_OPTIONS)
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
    hostSetup: parseHostSetup(plan.hostSetup),
    nextStep: typeof plan.nextStep === "string" ? plan.nextStep : null,
    confidence: typeof plan.confidence === "number" ? Math.max(0, Math.min(1, plan.confidence)) : 0,
  };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * After saving `hostSetup.tripRange`, set `dates.options` to a single ISO range string so AI/collab
 * context matches the host calendar (avoids stale May/June from the original parser).
 */
export function planRecordWithDatesSyncedToTripRange(
  plan: Record<string, unknown>,
  tripRange: unknown
): Record<string, unknown> {
  if (tripRange === null) return plan;
  if (!tripRange || typeof tripRange !== "object") return plan;
  const o = tripRange as Record<string, unknown>;
  const startIso = typeof o.startIso === "string" ? o.startIso : "";
  const endIso = typeof o.endIso === "string" ? o.endIso : "";
  if (!ISO_DAY.test(startIso) || !ISO_DAY.test(endIso)) return plan;
  const prevDates =
    plan.dates && typeof plan.dates === "object" && !Array.isArray(plan.dates)
      ? (plan.dates as Record<string, unknown>)
      : {};
  return {
    ...plan,
    dates: {
      ...prevDates,
      options: [`${startIso} to ${endIso}`],
    },
  };
}

/**
 * First calendar range from `plan.dates.options` only when options use explicit days
 * (ISO, slash ranges, “May 4–15, 2026”, etc.). Returns null for vague text that only
 * matches the loose `Date` fallback — so the host calendar won’t pre-highlight fuzzy ranges.
 */
export function concreteTripRangeFromPlanDates(
  plan: TripPlan,
  fallbackYear: number
): { startIso: string; endIso: string } | null {
  const y0 = inferDefaultYearFromDateOptions(plan.dates.options, fallbackYear);
  for (const opt of plan.dates.options) {
    const r = parseConcreteDateOptionToRange(opt, y0);
    if (r) {
      return { startIso: formatLocalIsoDate(r.start), endIso: formatLocalIsoDate(r.end) };
    }
  }
  return null;
}

const MAX_TRIP_RANGE_DAYS = 370;

/**
 * Strict ISO/slug ranges first; if none match, uses the loose parser (incl. `Date` fallback)
 * so model‑phrased options still map to a calendar range when possible.
 */
export function tripRangeBestEffortFromPlanDates(
  plan: TripPlan,
  fallbackYear: number
): { startIso: string; endIso: string } | null {
  const strict = concreteTripRangeFromPlanDates(plan, fallbackYear);
  if (strict) return strict;
  const y0 = inferDefaultYearFromDateOptions(plan.dates.options, fallbackYear);
  for (const opt of plan.dates.options) {
    const t = typeof opt === "string" ? opt.trim() : "";
    if (!t) continue;
    const r = parseDateOptionToRange(t, y0);
    if (!r) continue;
    const a = startOfLocalDay(r.start);
    const b = startOfLocalDay(r.end);
    if (localDayTime(a) > localDayTime(b)) continue;
    const spanDays = (localDayTime(b) - localDayTime(a)) / (24 * 60 * 60 * 1000);
    if (spanDays > MAX_TRIP_RANGE_DAYS) continue;
    const startIso = formatLocalIsoDate(a);
    const endIso = formatLocalIsoDate(b);
    if (parseLocalIsoDate(startIso) && parseLocalIsoDate(endIso)) {
      return { startIso, endIso };
    }
  }

  const joined = plan.dates.options
    .map((o) => (typeof o === "string" ? o.trim() : ""))
    .filter(Boolean)
    .join("; ");
  if (joined) {
    const r = parseDateOptionToRange(joined, y0);
    if (r) {
      const a = startOfLocalDay(r.start);
      const b = startOfLocalDay(r.end);
      if (localDayTime(a) <= localDayTime(b)) {
        const spanDays = (localDayTime(b) - localDayTime(a)) / (24 * 60 * 60 * 1000);
        if (spanDays <= MAX_TRIP_RANGE_DAYS) {
          const startIso = formatLocalIsoDate(a);
          const endIso = formatLocalIsoDate(b);
          if (parseLocalIsoDate(startIso) && parseLocalIsoDate(endIso)) {
            return { startIso, endIso };
          }
        }
      }
    }
  }

  return null;
}

/**
 * When creating a draft, persist {@link HostSetupState.tripRange} only from **concrete** date text
 * (ISO ranges, spelled-out day spans, etc.). Loose “July 2026” / `Date` parses are excluded so we
 * do not silently save whole-month spans that fight the planner’s narrower windows.
 *
 * {@link tripRangeBestEffortFromPlanDates} stays available for ancillary features that still want a fuzzy guess.
 */
export function tripRangeForHostDraftSave(
  plan: TripPlan,
  fallbackYear: number
): { startIso: string; endIso: string } | null {
  return concreteTripRangeFromPlanDates(plan, fallbackYear);
}

/** @deprecated Use concreteTripRangeFromPlanDates */
export function inferredTripRangeFromPlanDates(plan: TripPlan, fallbackYear: number) {
  return concreteTripRangeFromPlanDates(plan, fallbackYear);
}

export function parseLocalIsoDate(iso: string): Date | null {
  if (!ISO_DAY.test(iso)) return null;
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return null;
  const dt = startOfLocalDay(new Date(y, m - 1, d, 12, 0, 0, 0));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function addLocalIsoDays(iso: string, deltaDays: number): string | null {
  const d = parseLocalIsoDate(iso);
  if (!d) return null;
  const n = new Date(d.getFullYear(), d.getMonth(), d.getDate() + deltaDays, 12, 0, 0, 0);
  return formatLocalIsoDate(startOfLocalDay(n));
}

/**
 * Merge a lodging pick from the calendar into `hotelStays` and set primary `hotel` for publish UIs.
 * - **full**: one segment for the entire trip range.
 * - **partial**: this stay runs from `fromDayIso` through `tripEndIso`; earlier days keep existing stays (trimmed).
 */
export function applyHostHotelSelection(
  existing: HostHotelStay[] | undefined,
  tripStartIso: string,
  tripEndIso: string,
  fromDayIso: string,
  place: PlaceSpotlight,
  scope: "full" | "partial"
): { hotelStays: HostHotelStay[]; hotel: PlaceSpotlight } {
  if (scope === "full") {
    const one: HostHotelStay = { startIso: tripStartIso, endIso: tripEndIso, place };
    return { hotelStays: [one], hotel: place };
  }

  if (!ISO_DAY.test(tripStartIso) || !ISO_DAY.test(tripEndIso) || !ISO_DAY.test(fromDayIso)) {
    const one: HostHotelStay = { startIso: tripStartIso, endIso: tripEndIso, place };
    return { hotelStays: [one], hotel: place };
  }

  if (fromDayIso < tripStartIso || fromDayIso > tripEndIso) {
    const one: HostHotelStay = { startIso: tripStartIso, endIso: tripEndIso, place };
    return { hotelStays: [one], hotel: place };
  }

  const dayBefore = addLocalIsoDays(fromDayIso, -1);
  const out: HostHotelStay[] = [];

  for (const s of existing ?? []) {
    if (!ISO_DAY.test(s.startIso) || !ISO_DAY.test(s.endIso)) continue;
    if (s.endIso < fromDayIso) {
      out.push(s);
      continue;
    }
    if (s.startIso >= fromDayIso) {
      continue;
    }
    if (s.startIso < fromDayIso && s.endIso >= fromDayIso && dayBefore && dayBefore >= s.startIso) {
      out.push({ ...s, endIso: dayBefore });
    }
  }

  out.push({ startIso: fromDayIso, endIso: tripEndIso, place });
  out.sort((a, b) => a.startIso.localeCompare(b.startIso));
  return { hotelStays: out, hotel: out[0]!.place };
}

function minIso(a: string, b: string): string {
  return a <= b ? a : b;
}

function maxIso(a: string, b: string): string {
  return a >= b ? a : b;
}

/** Split `[S,E]` around `[a,b]` inclusive; drop pieces fully inside the cut. */
function clipExistingStay(stay: HostHotelStay, cutStart: string, cutEnd: string): HostHotelStay[] {
  const S = stay.startIso;
  const E = stay.endIso;
  if (!ISO_DAY.test(S) || !ISO_DAY.test(E)) return [];
  if (E < cutStart || S > cutEnd) return [stay];
  const parts: HostHotelStay[] = [];
  const leftEnd = addLocalIsoDays(cutStart, -1);
  if (leftEnd && ISO_DAY.test(leftEnd) && S <= leftEnd) {
    const endCap = minIso(E, leftEnd);
    if (S <= endCap) parts.push({ ...stay, endIso: endCap });
  }
  const rightStart = addLocalIsoDays(cutEnd, 1);
  if (rightStart && ISO_DAY.test(rightStart) && E >= rightStart) {
    const startCap = maxIso(S, rightStart);
    if (startCap <= E) parts.push({ ...stay, startIso: startCap });
  }
  return parts;
}

/**
 * Replace/add a stay for nights `stayStartIso`…`stayEndIso` (inclusive), clamped to the trip.
 * Existing stays are trimmed where they overlap this interval.
 */
export function applyHostHotelDateRange(
  existing: HostHotelStay[] | undefined,
  tripStartIso: string,
  tripEndIso: string,
  stayStartIso: string,
  stayEndIso: string,
  place: PlaceSpotlight
): { hotelStays: HostHotelStay[]; hotel: PlaceSpotlight } {
  if (!ISO_DAY.test(tripStartIso) || !ISO_DAY.test(tripEndIso)) {
    const one: HostHotelStay = { startIso: stayStartIso, endIso: stayEndIso, place };
    return { hotelStays: [one], hotel: place };
  }
  let a = stayStartIso;
  let b = stayEndIso;
  if (!ISO_DAY.test(a) || !ISO_DAY.test(b)) {
    const one: HostHotelStay = { startIso: tripStartIso, endIso: tripEndIso, place };
    return { hotelStays: [one], hotel: place };
  }
  if (a > b) [a, b] = [b, a];
  if (a < tripStartIso) a = tripStartIso;
  if (b > tripEndIso) b = tripEndIso;
  if (a > b) {
    const one: HostHotelStay = { startIso: tripStartIso, endIso: tripEndIso, place };
    return { hotelStays: [one], hotel: place };
  }

  const trimmed: HostHotelStay[] = [];
  for (const s of existing ?? []) {
    for (const frag of clipExistingStay(s, a, b)) {
      trimmed.push(frag);
    }
  }
  trimmed.push({ startIso: a, endIso: b, place });
  trimmed.sort((x, y) => x.startIso.localeCompare(y.startIso));
  return { hotelStays: trimmed, hotel: place };
}

export function hotelStayForDay(stays: HostHotelStay[] | undefined, dayIso: string): HostHotelStay | null {
  if (!stays?.length || !ISO_DAY.test(dayIso)) return null;
  for (const s of stays) {
    if (dayIso >= s.startIso && dayIso <= s.endIso) return s;
  }
  return null;
}

/** Inclusive list of yyyy-mm-dd between start and end (invalid / wrong order → []). */
export function enumerateLocalIsoDays(startIso: string, endIso: string): string[] {
  const a = parseLocalIsoDate(startIso);
  const b = parseLocalIsoDate(endIso);
  if (!a || !b) return [];
  if (a.getTime() > b.getTime()) return [];
  const out: string[] = [];
  let cur = startOfLocalDay(a);
  const end = startOfLocalDay(b);
  /** Compare calendar days — raw `getTime()` breaks after we advance `cur` to noon (end is midnight). */
  while (localDayTime(cur) <= localDayTime(end)) {
    out.push(formatLocalIsoDate(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1, 12, 0, 0, 0);
  }
  return out;
}

export function hostHasConcreteTripRange(plan: TripPlan): boolean {
  const hs = plan.hostSetup?.tripRange;
  if (hs?.startIso && hs?.endIso && ISO_DAY.test(hs.startIso) && ISO_DAY.test(hs.endIso)) {
    const a = parseLocalIsoDate(hs.startIso);
    const b = parseLocalIsoDate(hs.endIso);
    return !!(a && b && a.getTime() <= b.getTime());
  }
  return false;
}

export function hostHasHotel(plan: TripPlan): boolean {
  const h = plan.hostSetup?.hotel;
  if (h?.name?.trim() && h.mapsUrl?.startsWith("http")) return true;
  const stays = plan.hostSetup?.hotelStays ?? [];
  return stays.some((s) => s.place?.name?.trim() && s.place.mapsUrl?.startsWith("http"));
}

export function hostHasKeptRestaurant(plan: TripPlan): boolean {
  const pins = plan.hostSetup?.restaurantPins ?? [];
  return pins.some((p) => p.kept && p.place.mapsUrl.startsWith("http"));
}

export function isHostPublishReady(plan: TripPlan): boolean {
  return hostHasConcreteTripRange(plan) && hostHasHotel(plan) && hostHasKeptRestaurant(plan);
}

/** 0–100 from the three publish requirements (dates, hotel, restaurant). */
export function hostSetupCompletionPercent(plan: TripPlan): number {
  let n = 0;
  if (hostHasConcreteTripRange(plan)) n += 1;
  if (hostHasHotel(plan)) n += 1;
  if (hostHasKeptRestaurant(plan)) n += 1;
  return Math.round((n / 3) * 100);
}

function dedupeSpotlights(urls: Set<string>, next: PlaceSpotlight[]): PlaceSpotlight[] {
  const added: PlaceSpotlight[] = [];
  for (const s of next) {
    const key = s.mapsUrl.trim().toLowerCase();
    if (!urls.has(key)) {
      urls.add(key);
      added.push(s);
    }
  }
  return added;
}

/**
 * Apply publish-time merges: sync `dates`, fold host picks into `spotlights`, clear transient `hostSetup`.
 */
export function planAfterHostPublish(plan: TripPlan): TripPlan {
  const range = plan.hostSetup?.tripRange;
  const startIso = range?.startIso ?? "";
  const endIso = range?.endIso ?? "";
  const hs = plan.hostSetup;
  const pins = (hs?.restaurantPins ?? []).filter((p) => p.kept);
  const actPins = (hs?.activityPins ?? [])
    .filter((p) => p.kept)
    .map((p) => experienceToSpotlight(p.experience))
    .filter((s): s is PlaceSpotlight => s != null);
  const hotel = hs?.hotel;
  const stayPlaces =
    hs?.hotelStays
      ?.map((s) => s.place)
      .filter((p) => p?.name?.trim() && p.mapsUrl.startsWith("http")) ?? [];

  const urls = new Set((plan.spotlights ?? []).map((s) => s.mapsUrl.trim().toLowerCase()));
  const folded: PlaceSpotlight[] = [...(plan.spotlights ?? [])];
  if (stayPlaces.length) {
    folded.push(
      ...dedupeSpotlights(
        urls,
        stayPlaces.map((p) => ({ ...p, spotlightCategory: "hotel" as const }))
      )
    );
  } else if (hotel?.name && hotel.mapsUrl.startsWith("http")) {
    folded.push(...dedupeSpotlights(urls, [{ ...hotel, spotlightCategory: "hotel" }]));
  }
  folded.push(
    ...dedupeSpotlights(
      urls,
      pins.map((p) => ({ ...p.place, spotlightCategory: "restaurant" as const }))
    )
  );
  folded.push(...dedupeSpotlights(urls, actPins));

  let dates = { ...plan.dates };
  if (ISO_DAY.test(startIso) && ISO_DAY.test(endIso)) {
    const a = parseLocalIsoDate(startIso);
    const b = parseLocalIsoDate(endIso);
    if (a && b && a.getTime() <= b.getTime()) {
      const opt =
        startIso === endIso
          ? startIso
          : `${startIso} to ${endIso}`;
      dates = {
        confirmed: true,
        options: [opt],
      };
    }
  }

  const { hostSetup: _discard, ...rest } = plan;
  void _discard;
  return {
    ...rest,
    dates,
    spotlights: folded.length ? folded : undefined,
    hostSetup: undefined,
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

  if (!planHasUsableTripTiming(plan)) {
    candidates.push({
      priority: 2,
      label:
        "When should this roughly land—even a season, month, or wide date range?",
    });
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

/** Apply the chat “dates” slot answer onto the plan (overrides model dates for this flow). */
export function applyDatesSlotToPlan(plan: TripPlan, datesSlotText: string): TripPlan {
  const v = datesSlotText.trim();
  if (!v) return plan;
  if (isDatesSlotTbdValue(v)) {
    return { ...plan, dates: { confirmed: false, options: [] } };
  }
  const line = v.length > 200 ? `${v.slice(0, 197)}…` : v;
  return { ...plan, dates: { confirmed: false, options: [line] } };
}

/** Apply the chat "departure" slot answer onto the plan. */
export function applyDepartureSlotToPlan(plan: TripPlan, departureSlotText: string): TripPlan {
  const v = departureSlotText.trim();
  if (!v) return plan;
  const line = v.length > 120 ? `${v.slice(0, 117)}…` : v;
  return { ...plan, departureCity: line };
}

/**
 * Busts live recommendation caches and triggers client refetch when inputs to live APIs change.
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
