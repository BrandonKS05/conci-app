import type { TripPlan } from "@/shared/trip-plan";
import type { HotelPick } from "@/shared/hotels";
import { buildRestaurantPicksFromVenueHints, type RestaurantPick } from "@/shared/restaurants";

export const COLLAB_VERSION = 1 as const;

export type DecisionKind = "dates" | "binary" | "hotel" | "people" | "generic" | "pick";

export type ClassifiedDecision = {
  key: string;
  label: string;
  index: number;
  kind: DecisionKind;
  /** For binary split (from open-ended copy) */
  options?: [string, string];
  /** 2–3 curated choices inferred by the parser */
  pickOptions?: string[];
  /** For hotel - filled after hotel search API (RapidAPI) or legacy mock */
  hotels?: HotelPick[];
  /** For food poll (`p_eat`) — deterministic cards from venue hints */
  restaurants?: RestaurantPick[];
};

/** Stable synth keys appended after openDecisions-derived `d*`. */
const SYNTH_DATES_KEY = "s_dates";

type PollSynthRow = {
  bucket: keyof NonNullable<TripPlan["polls"]>;
  key: string;
  label: string;
};
/** Food poll stable key — used for richer restaurant cards vs generic picks */
export const VENUE_POLL_DECISION_KEY = "p_eat" as const;

const POLL_SYNTH_ROWS: readonly PollSynthRow[] = [
  { bucket: "destinations", key: "p_dest", label: "Destination" },
  { bucket: "venues", key: VENUE_POLL_DECISION_KEY, label: "Where should we eat?" },
  { bucket: "activities", key: "p_activity", label: "What should we prioritize?" },
  { bucket: "vibePick", key: "p_vibe", label: "Trip vibe" },
  { bucket: "budgetPick", key: "p_budget", label: "Budget per person" },
  { bucket: "transport", key: "p_transport", label: "How we get there" },
];

export type CollabStateV1 = {
  v: typeof COLLAB_VERSION;
  decisions: Record<string, CollabDecisionBlob>;
};

export type CollabDecisionBlob = {
  kind: DecisionKind;
  votes: Record<string, unknown>;
  locked?: unknown;
  /** Persisted for hotel decisions */
  hotels?: HotelPick[];
  /** Persisted venue cards for `p_eat` */
  restaurants?: RestaurantPick[];
};

export function decisionKeyForIndex(i: number): string {
  return `d${i}`;
}

export function collaborationQuorum(plan: TripPlan): number {
  const n = plan.people.count ?? plan.people.names.length ?? 2;
  return Math.min(Math.max(n, 2), 10);
}

export function classifyDecisionText(text: string, index: number): Omit<ClassifiedDecision, "key"> {
  const t = text.toLowerCase();
  const label = text.trim() || `Decision ${index + 1}`;

  if (/hotel|accommodation|\bstay\b|airbnb|where to stay|lodging/.test(t)) {
    return { label, index, kind: "hotel" };
  }
  if (
    /date|when|which (day|weekend|dates)|\bweek\b|calendar|june|july|august|september|october/.test(t) ||
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/.test(t)
  ) {
    return { label, index, kind: "dates" };
  }
  if (/who'?s coming|who is coming|headcount|how many people|rsvp|everyone in|coming or not/.test(t)) {
    return { label, index, kind: "people" };
  }
  if (/flight|flights|fly|flying|drive|driving|car|road|transport|\bmeet there\b|\bmeet (you )?there\b/.test(t)) {
    return { label, index, kind: "binary", options: ["Flights / fly", "Drive / ride together"] };
  }
  const orParts = text.split(/\s+or\s+/i).map((s) => s.replace(/[?.!,]+$/g, "").trim()).filter(Boolean);
  if (orParts.length >= 2) {
    return {
      label,
      index,
      kind: "binary",
      options: [orParts[0]!.slice(0, 48), orParts[1]!.slice(0, 48)] as [string, string],
    };
  }
  return { label, index, kind: "generic", options: ["Yes", "No"] };
}

function openDecisionsToClassified(plan: TripPlan): ClassifiedDecision[] {
  return plan.openDecisions.map((raw, index) => {
    const base = classifyDecisionText(raw, index);
    const key = decisionKeyForIndex(index);
    const hotels = base.kind === "hotel" ? ([] as HotelPick[]) : undefined;
    return { ...base, key, label: raw.trim() || base.label, hotels };
  });
}

function synthDatePollIfNeeded(plan: TripPlan, open: ClassifiedDecision[]): ClassifiedDecision | null {
  const already = open.some((c) => c.kind === "dates");
  if (already || plan.dates.confirmed) return null;
  const opts = plan.dates.options;
  if (opts.length < 2) return null;
  const index = open.length;
  return {
    key: SYNTH_DATES_KEY,
    label: "Which dates work?",
    index,
    kind: "dates",
  };
}

function synthPollDecisions(plan: TripPlan, openLength: number): ClassifiedDecision[] {
  const polls = plan.polls;
  if (!polls) return [];
  const out: ClassifiedDecision[] = [];
  let i = 0;
  for (const row of POLL_SYNTH_ROWS) {
    const options = polls[row.bucket];
    if (!options || options.length < 2) continue;
    const synth: ClassifiedDecision = {
      key: row.key,
      label: row.label,
      index: openLength + i,
      kind: "pick",
      pickOptions: options,
    };
    if (row.key === VENUE_POLL_DECISION_KEY) {
      synth.restaurants = buildRestaurantPicksFromVenueHints(plan, options);
    }
    out.push(synth);
    i += 1;
  }
  return out;
}

/** Classified decisions for collab: openDecisions text + inferred date poll + structured polls. */
export function buildClassifiedDecisions(plan: TripPlan): ClassifiedDecision[] {
  const open = openDecisionsToClassified(plan);
  const dateSynth = synthDatePollIfNeeded(plan, open);
  const tail = synthPollDecisions(plan, open.length + (dateSynth ? 1 : 0));
  if (!dateSynth) return [...open, ...tail];
  return [...open, dateSynth, ...tail];
}

/** Dates are settled enough to search hotels/dinner (stay length matters). */
export function datesGroupResolved(plan: TripPlan, classified: ClassifiedDecision[], collab: CollabStateV1): boolean {
  if (plan.dates.confirmed) return true;
  const dm = classified.find((c) => c.kind === "dates");
  if (!dm) return true;
  if (plan.dates.options.length < 2) return true;
  return isDecisionLocked(collab.decisions[dm.key]);
}

/** Hide hotel / dinner cards until weekends are picked (pricing & OT links assume dates). */
export function decisionDependsOnDatesLocked(meta: ClassifiedDecision): boolean {
  return meta.kind === "hotel" || meta.key === VENUE_POLL_DECISION_KEY;
}

export function parseCollabState(raw: unknown): CollabStateV1 {
  if (!raw || typeof raw !== "object") {
    return { v: COLLAB_VERSION, decisions: {} };
  }
  const o = raw as Record<string, unknown>;
  if (o.v !== COLLAB_VERSION || typeof o.decisions !== "object" || !o.decisions) {
    return { v: COLLAB_VERSION, decisions: {} };
  }
  return { v: COLLAB_VERSION, decisions: o.decisions as Record<string, CollabDecisionBlob> };
}

function pluralityWinner(counts: Record<string, number>, preferenceOrder: string[]): string | null {
  let best: string | null = null;
  let bestN = -1;
  for (const k of preferenceOrder) {
    const n = counts[k] ?? 0;
    if (n > bestN) {
      bestN = n;
      best = k;
    }
  }
  return bestN > 0 ? best : null;
}

export function tryLockDecision(
  plan: TripPlan,
  meta: ClassifiedDecision,
  blob: CollabDecisionBlob,
  quorum: number
): CollabDecisionBlob {
  if (blob.locked !== undefined && blob.locked !== null) {
    return blob;
  }

  const votes = blob.votes as Record<string, unknown>;
  const voterCount = Object.keys(votes).length;
  if (voterCount < quorum) {
    return blob;
  }

  if (meta.kind === "dates") {
    const options = plan.dates.options;
    if (options.length === 0) return blob;
    const tally: Record<string, number> = {};
    for (const o of options) tally[o] = 0;
    for (const v of Object.values(votes)) {
      if (typeof v === "string" && options.includes(v)) {
        tally[v] = (tally[v] ?? 0) + 1;
      }
    }
    const winner = pluralityWinner(tally, options);
    if (winner) {
      return { ...blob, locked: winner };
    }
  }

  if (meta.kind === "binary" || meta.kind === "generic") {
    const opts = meta.options ?? ["Yes", "No"];
    const tally: Record<string, number> = {};
    for (const o of opts) tally[o] = 0;
    for (const v of Object.values(votes)) {
      if (typeof v === "string" && opts.includes(v)) {
        tally[v] = (tally[v] ?? 0) + 1;
      }
    }
    const winner = pluralityWinner(tally, opts);
    if (winner) {
      return { ...blob, locked: winner };
    }
  }

  if (meta.kind === "pick") {
    const list = blob.restaurants?.length ? blob.restaurants : meta.restaurants;
    const pickTexts = meta.pickOptions ?? [];
    const voteKeys = list?.length ? list.map((r) => r.id) : pickTexts;
    if (voteKeys.length === 0) return blob;
    const tally: Record<string, number> = {};
    for (const k of voteKeys) tally[k] = 0;
    const idByName =
      list?.reduce<Record<string, string>>((acc, r) => {
        acc[r.name] = r.id;
        return acc;
      }, {}) ?? {};
    for (const v of Object.values(votes)) {
      if (typeof v !== "string") continue;
      if (voteKeys.includes(v)) {
        tally[v] = (tally[v] ?? 0) + 1;
      } else if (idByName[v]) {
        const id = idByName[v]!;
        tally[id] = (tally[id] ?? 0) + 1;
      } else if (!list?.length && pickTexts.includes(v)) {
        tally[v] = (tally[v] ?? 0) + 1;
      }
    }
    const winner = pluralityWinner(tally, voteKeys);
    if (winner && list?.length) {
      const hit = list.find((r) => r.id === winner);
      return { ...blob, locked: hit ? { id: hit.id, name: hit.name } : { id: winner, name: winner } };
    }
    if (winner) return { ...blob, locked: winner };
  }

  if (meta.kind === "hotel") {
    const hotelList = blob.hotels?.length ? blob.hotels : meta.hotels;
    if (hotelList?.length) {
      const tally: Record<string, number> = {};
      for (const h of hotelList) tally[h.id] = 0;
      for (const v of Object.values(votes)) {
        if (typeof v === "string" && tally[v] !== undefined) {
          tally[v] = (tally[v] ?? 0) + 1;
        }
      }
      const order = hotelList.map((h) => h.id);
      const winnerId = pluralityWinner(tally, order);
      if (winnerId) {
        const hotel = hotelList.find((h) => h.id === winnerId);
        return { ...blob, locked: hotel ? { id: hotel.id, name: hotel.name } : winnerId };
      }
    }
  }

  if (meta.kind === "people") {
    const stanceOrder = ["in", "maybe", "out"] as const;
    const names = plan.people.names.length ? plan.people.names : [];
    if (names.length === 0) {
      if (voterCount >= quorum) {
        return { ...blob, locked: { headcount: plan.people.count ?? 0, names: [] as string[] } };
      }
      return blob;
    }
    /** Per-named-traveler tally of RSVP stances across voters. */
    const tallies: Record<string, Record<(typeof stanceOrder)[number], number>> = {};
    for (const n of names) {
      tallies[n] = { in: 0, maybe: 0, out: 0 };
    }
    for (const payload of Object.values(votes)) {
      if (!payload || typeof payload !== "object") continue;
      const row = payload as Record<string, string>;
      for (const n of names) {
        const s = row[n];
        if (s === "in" || s === "maybe" || s === "out") {
          tallies[n]![s] = (tallies[n]![s] ?? 0) + 1;
        }
      }
    }
    let everyNameResolved = true;
    const roster: Record<string, "in" | "maybe" | "out"> = {};
    for (const n of names) {
      const t = tallies[n]!;
      const total = (t.in ?? 0) + (t.maybe ?? 0) + (t.out ?? 0);
      if (total === 0) {
        everyNameResolved = false;
        break;
      }
      const w = pluralityWinner(t, [...stanceOrder]);
      if (!w) {
        everyNameResolved = false;
        break;
      }
      roster[n] = w as "in" | "maybe" | "out";
    }
    if (everyNameResolved && voterCount >= quorum) {
      const definiteIn = names.filter((n) => roster[n] === "in");
      const maybeNamed = names.filter((n) => roster[n] === "maybe");
      const others =
        plan.people.count != null && plan.people.count > names.length ? plan.people.count - names.length : 0;
      return {
        ...blob,
        locked: {
          headcount: definiteIn.length + others,
          names: definiteIn,
          maybeNames: maybeNamed.length ? maybeNamed : undefined,
          roster,
        },
      };
    }
  }

  return blob;
}

export function isDecisionLocked(blob: CollabDecisionBlob | undefined): boolean {
  if (!blob) return false;
  return blob.locked !== undefined && blob.locked !== null;
}

export function countLocked(classified: ClassifiedDecision[], collab: CollabStateV1): number {
  let n = 0;
  for (const c of classified) {
    const b = collab.decisions[c.key];
    if (isDecisionLocked(b)) n += 1;
  }
  return n;
}

/** True when every classified decision is locked (or there are none). */
export function allDecisionsResolvedForPlan(plan: TripPlan, collab: CollabStateV1): boolean {
  const classified = buildClassifiedDecisions(plan);
  if (classified.length === 0) return true;
  return countLocked(classified, collab) === classified.length;
}

/** Winning hotel after votes locked (for booking checklist). */
export function winningHotelPickFromCollab(
  classified: ClassifiedDecision[],
  collab: CollabStateV1
): HotelPick | null {
  for (const meta of classified) {
    if (meta.kind !== "hotel") continue;
    const blob = collab.decisions[meta.key];
    if (!isDecisionLocked(blob) || !blob?.locked) continue;
    const hotels = blob.hotels ?? meta.hotels ?? [];
    const L = blob.locked;
    let id: string | null = null;
    let nameFallback = "Hotel";
    if (typeof L === "object" && L !== null && "id" in L) {
      const o = L as { id?: string; name?: string };
      id = typeof o.id === "string" ? o.id : o.id != null ? String(o.id) : null;
      if (typeof o.name === "string") nameFallback = o.name;
    } else if (typeof L === "string") {
      id = L;
    }
    if (!id) continue;
    const h = hotels.find((x) => x.id === id);
    if (h) return h;
    return { id, name: nameFallback, area: "", priceHint: "" };
  }
  return null;
}
