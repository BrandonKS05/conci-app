/**
 * Heuristic “reality check” for trip budgets in the conversational parser.
 * Not a gate — callers append a gentle assistant-only note when likely too low.
 */

function cleanLocationLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").replace(/^[\s"|'“]+|[\s"|'”]+$/g, "");
}

/** Domestic-style flight allowance (round-trip) in USD for floor math. */
const FLIGHT_DOMESTIC_USD = 320;
/** International-ish flight allowance in USD for floor math. */
const FLIGHT_INTL_USD = 780;

/** Default trip length when we cannot infer nights from dates. */
const DEFAULT_NIGHTS = 5;

/** If the user’s stated per-person budget is below this fraction of our floor, emit a soft warning. */
const TIGHT_RATIO = 0.72;

const INTL_HINT = /\b(abroad|international|overseas|europe|asia|oceania|africa|schengen)\b/i;

/** Region / hotspot multipliers vs a generic USD daily floor (lodging split + food + local transport + light activities). */
const LOCATION_RULES: { re: RegExp; dailyUsd: number; label: string }[] = [
  { re: /\b(honolulu|maui|oahu|kauai|big island|hawaii)\b/i, dailyUsd: 240, label: "Hawaii" },
  {
    re: /\b(miami|south beach|key west|orlando)\b|\b(FL|florida)\b.*\b(beach)\b/i,
    dailyUsd: 210,
    label: "South Florida",
  },
  {
    re: /\b(new york|nyc|brooklyn|manhattan|san francisco|sf\b|los angeles|malibu|sandiego|san diego)\b/i,
    dailyUsd: 220,
    label: "major US metro",
  },
  { re: /\b(london|paris|rome|milan|amsterdam|barcelona|munich|zurich|dublin)\b/i, dailyUsd: 195, label: "Western Europe city" },
  { re: /\b(tokyo|osaka|seoul|singapore|sydney|melbourne)\b/i, dailyUsd: 185, label: "long-haul city" },
  { re: /\b(cabo|cancún|cancun|tulum|riviera maya)\b/i, dailyUsd: 175, label: "Caribbean / Mexico resort" },
  {
    re: /\b(beach resort|ski trip|dolomites)\b|\b(us national park|grand canyon)\b|\b(patagonia|safari)\b/i,
    dailyUsd: 170,
    label: "vacation-heavy destination",
  },
];

/** Heuristic: overseas when city hints or trip copy suggests it. */
function locationLooksInternational(locationRaw: string, seedSnippet: string): boolean {
  const locCombined = `${locationRaw} ${seedSnippet}`.toLowerCase();
  if (/\b(cancún|cancun|cabo|tulum|riviera maya|punta cana)\b/i.test(locCombined)) {
    return false;
  }
  const loc = locCombined;
  if (INTL_HINT.test(loc)) return true;
  if (
    /\b(paris|london|tokyo|rome|barcelona|amsterdam|dublin|sydney|vancouver\b|montreal|toronto)\b/i.test(
      loc
    )
  ) {
    return true;
  }
  return false;
}

function inferredDailyUsd(locationRaw: string, intl: boolean): { daily: number; placePhrase: string } {
  const loc = cleanLocationLabel(locationRaw) || locationRaw;
  for (const rule of LOCATION_RULES) {
    if (rule.re.test(loc)) {
      return { daily: rule.dailyUsd, placePhrase: ` in ${rule.label}` };
    }
  }
  if (intl) return { daily: 165, placePhrase: " for that destination" };
  return { daily: 135, placePhrase: " for a trip like this" };
}

/** Parse explicit “N night(s)” or “N day(s)” from free text (dates or seed). */
function parseExplicitNights(text: string): number | null {
  const t = text.toLowerCase();
  let m = t.match(/\b(\d+)\s*(?:-|–|—)?\s*night(?:s)?\b/);
  if (m) return Math.max(1, Math.min(60, parseInt(m[1]!, 10)));
  m = t.match(/\b(\d+)\s*(?:-|–|—)?\s*day(?:s)?\b/);
  if (m) {
    const days = parseInt(m[1]!, 10);
    return Math.max(1, Math.min(60, Math.max(1, days - 1)));
  }
  if (/\bweekend\b|\btwo\s*days\b|\b2\s*-?\s*day\b/i.test(text)) return 2;
  if (/\bone\s*-?\s*week\b|\b7\s*-?\s*days\b|\b(full\s)?10\s*-?\s*days\b/i.test(text)) return 6;
  if (/\btwo\s*weeks?\b|\b14\s*days\b|\b2\s*weeks?\b/i.test(text)) return 13;
  return null;
}

/**
 * Best-effort nights from the dates slot (often "Jan 5, 2026 – Jan 12, 2026" or rough text).
 */
export function estimateTripNights(datesSlot: string, seedMessage: string): number {
  const explicit = parseExplicitNights(`${datesSlot}\n${seedMessage}`);
  if (explicit != null) return explicit;

  const combined = datesSlot.replace(/\u2013|\u2014/g, "-");
  const parts = combined.split(/\s*[-–—]\s*/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const d0 = Date.parse(parts[0]!);
    const d1 = Date.parse(parts[1]!);
    if (!Number.isNaN(d0) && !Number.isNaN(d1)) {
      const nights = Math.round((Math.abs(d1 - d0) / 86400000) || 0);
      const clamped = Math.max(1, Math.min(nights, 45));
      return clamped;
    }
  }
  const solo = Date.parse(parts[0] || datesSlot.trim());
  if (!Number.isNaN(solo)) {
    return Math.min(45, Math.max(2, DEFAULT_NIGHTS));
  }

  const rough = datesSlot.trim().length > 3 ? `${datesSlot} ${seedMessage}` : seedMessage;
  if (/\b(month|months|summer|winter|spring|fall|autumn)\b/i.test(rough)) return 8;
  return DEFAULT_NIGHTS;
}

/** Extract numeric USD range from budget answer — assumes per-person unless clearly “total for group”. */
export function parsePerPersonBudgetUsd(answer: string, headcountHint: number | null): { min: number; max: number } | null {
  const t = answer.toLowerCase().replace(/,/g, " ");
  const totalForGroup =
    /\b(total|overall|combined|whole group|all of us|for\s+(all\s+)?\d+)\b/i.test(answer) ||
    /\b(entire\s+trip|whole\s+trip|for\s+everyone)\b/i.test(answer);

  const picks: number[] = [];
  // $2.5k style
  for (const m of t.matchAll(/\$\s*(\d+(?:\.\d+)?)\s*k\b/g)) {
    picks.push(parseFloat(m[1]!) * 1000);
  }
  // 2k style (no dollar)
  for (const m of t.matchAll(/\b(\d+(?:\.\d+)?)\s*k\b/g)) {
    if (t.includes("$") && t.indexOf(`${m[1]}k`) > t.lastIndexOf("$")) {
      picks.push(parseFloat(m[1]!) * 1000);
    } else if (!t.includes("$")) {
      picks.push(parseFloat(m[1]!) * 1000);
    }
  }
  // Plain dollars
  for (const m of t.matchAll(/\$\s*(\d+(?:\.\d+)?)\b/g)) {
    picks.push(parseFloat(m[1]!));
  }

  for (const m of answer.matchAll(/\b(?:about|around|~|budget|maybe|only|up\s*to|max)\s+(\d{3,6})\b/gi)) {
    picks.push(parseFloat(m[1]!));
  }

  const perPersonBare = answer.match(/\b(\d{3,6})\s*(?:\/\s*pp|\bpp\b|\beach\b|per\s+person)\b/i);
  if (perPersonBare) picks.push(parseFloat(perPersonBare[1]!));

  const trimmedAllDigits = answer.trim().match(/^(\d{3,6})$/);
  if (trimmedAllDigits) picks.push(parseFloat(trimmedAllDigits[1]!));

  let low = picks.length ? Math.min(...picks) : NaN;
  let high = picks.length ? Math.max(...picks) : NaN;
  // "600-800"
  const rangeBare = answer.match(/\b(\d+(?:\.\d+)?)\s*[–\-]\s*(\d+(?:\.\d+)?)\b/);
  if (rangeBare) {
    const a = parseFloat(rangeBare[1]!);
    const b = parseFloat(rangeBare[2]!);
    low = Math.min(a, b);
    high = Math.max(a, b);
    if (/k\b/i.test(answer.slice(answer.indexOf(rangeBare[0])))) {
      low *= 1000;
      high *= 1000;
    }
  }

  if (!Number.isFinite(low)) return null;

  if (!Number.isFinite(high)) high = low;
  low = Math.max(0, low);
  high = Math.max(low, high);

  if (totalForGroup && headcountHint != null && headcountHint >= 2) {
    low /= headcountHint;
    high /= headcountHint;
  }

  return { min: low, max: high };
}

function formatUsd(n: number): string {
  if (n >= 1000) return `$${Math.round(n / 100) / 10}k`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** Headcount from people slot ("4 (Amy, ...)") etc. — best effort. */
export function parsePeopleCount(peopleSlot: string | undefined): number | null {
  if (!(peopleSlot || "").trim()) return null;
  const m = peopleSlot!.match(/^(\d+)\b/);
  if (m) return Math.max(1, parseInt(m[1]!, 10));
  const m2 = peopleSlot!.match(/\b(\d+)\s*(?:traveler|travelers|people|guests|person|persons)?\b/i);
  return m2 ? Math.max(1, parseInt(m2[1]!, 10)) : null;
}

export type SlotsLike = {
  location?: string | undefined;
  dates?: string | undefined;
  people?: string | undefined;
  budget?: string | undefined;
  vibe?: string | undefined;
};

/**
 * Single assistant-string soft warning or null when we shouldn’t nag.
 */
export function buildBudgetSoftWarning(
  slots: SlotsLike & Record<string, string | undefined>,
  seedMessage: string
): string | null {
  const loc = (slots.location || "").trim();
  const dates = (slots.dates || "").trim();
  const people = slots.people;
  const rawBudget = (slots.budget || "").trim();
  if (!rawBudget || !loc) return null;

  const headcount = parsePeopleCount(people);
  const range = parsePerPersonBudgetUsd(rawBudget, headcount);
  if (!range) return null;

  const userCeiling = Math.max(range.min, range.max);

  /** Skip caution for shoestring intents */
  if (/\b(backpack|hostel|crash|minimal|cheap as possible|rubbermaid)\b/i.test(`${rawBudget} ${seedMessage}`))
    return null;

  /** Too-small numbers are often misunderstandings (“$45” typo) — still warn gently */
  if (userCeiling < 50) return null;

  const nights = estimateTripNights(dates, seedMessage);
  const intl = locationLooksInternational(loc, seedMessage.slice(0, 400));

  const { daily, placePhrase } = inferredDailyUsd(loc, intl);
  const flight = intl ? FLIGHT_INTL_USD : FLIGHT_DOMESTIC_USD;
  /** Conservative “typical all-in floor” once flights + lodging splits + baseline spend are accounted for */
  const floor = flight + daily * nights;
  /** Don’t scare people who are intentionally close-ish */
  if (userCeiling >= floor * TIGHT_RATIO) return null;

  const cityLabel = cleanLocationLabel(loc)?.split(",")[0]?.trim() || loc.slice(0, 48) || "that destination";

  const nightsPhrase = `${nights} night${nights === 1 ? "" : "s"}`;
  const budgetHint =
    range.min !== range.max
      ? `around ${formatUsd(range.min)}–${formatUsd(range.max)} per person`
      : `about ${formatUsd(userCeiling)} per person`;

  return `Heads up — ${nightsPhrase} in ${cityLabel} typically runs about ${formatUsd(floor)} per person once flights and lodging are counted${placePhrase}. At ${budgetHint}, things might feel tight — totally fine to keep going; nothing’s locked, and we can reshape the plan anytime.`;
}
