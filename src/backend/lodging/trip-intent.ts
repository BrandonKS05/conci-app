/**
 * Extract lodging-relevant intent from whatever the user gave us — vibe chips,
 * the composed trip prompt (seed_text, which folds in the raw prompt + "anything
 * else" notes), and budget. Produces (a) a signal set used for scoring and
 * (b) a natural-language aiSearch query. Free-text is treated as high signal.
 */

export type LodgingSignal =
  | "luxury"
  | "boutique"
  | "romantic"
  | "nightlife"
  | "family"
  | "beach"
  | "cultural"
  | "foodie"
  | "adventure"
  | "relaxing"
  | "budget"
  | "central"
  | "accessibility"
  | "transit"
  | "quality";

type Rule = { signal: LodgingSignal; re: RegExp; phrase: string };

// Order matters only for query readability. Phrases feed the aiSearch query.
const RULES: Rule[] = [
  { signal: "luxury", re: /\b(luxur\w*|upscale|five[-\s]?star|5[-\s]?star|high[-\s]?end|splurge|fancy|premium|deluxe)\b/, phrase: "upscale" },
  { signal: "boutique", re: /\b(boutique|design hotel|stylish|charming|chic|trendy)\b/, phrase: "boutique" },
  { signal: "romantic", re: /\b(romanti\w*|honeymoon|anniversary|couples?|intimate)\b/, phrase: "romantic" },
  { signal: "nightlife", re: /\b(nightlife|night life|bars?|clubs?|party\w*|going out|drinks|lively)\b/, phrase: "near nightlife" },
  { signal: "family", re: /\b(famil\w+|kids?|children|toddler\w*|child[-\s]?friendly)\b/, phrase: "family-friendly" },
  { signal: "beach", re: /\b(beach\w*|resort|oceanfront|seaside|coast\w*|surf\w*)\b/, phrase: "near the beach" },
  { signal: "cultural", re: /\b(museum\w*|histor\w+|cultur\w+|art\b|sightsee\w*|landmark\w*|monument\w*)\b/, phrase: "near cultural sights" },
  { signal: "foodie", re: /\b(food\w*|foodie|culinary|restaurants?|dining|michelin|cuisine|eat\w*)\b/, phrase: "near great restaurants" },
  { signal: "adventure", re: /\b(adventur\w*|hiking|hike|outdoors?|ski\w*|surf\w*|active|trek\w*|climb\w*)\b/, phrase: "good base for an active trip" },
  { signal: "relaxing", re: /\b(relax\w*|spa|wellness|quiet|peaceful|calm|unwind|tranquil|chill)\b/, phrase: "relaxing with spa or wellness" },
  { signal: "budget", re: /\b(budget|cheap\w*|affordable|inexpensive|economical|value|not too expensive|save money|tight)\b/, phrase: "great value" },
  { signal: "central", re: /\b(central|walkable|walk everywhere|downtown|city cent(?:er|re)|near everything|heart of)\b/, phrase: "central, walkable location" },
  { signal: "accessibility", re: /\b(wheelchair|accessib\w*|mobility|ground floor|elevator|step[-\s]?free|disab\w*)\b/, phrase: "wheelchair accessible and step-free" },
  { signal: "transit", re: /\b(public transit|metro|subway|underground|train station|near transit|transit)\b/, phrase: "near public transit" },
  { signal: "quality", re: /\b(clean|well[-\s]?reviewed|highly rated|top[-\s]?rated|nice hotel|great reviews)\b/, phrase: "highly rated" },
];

export type TripLodgingIntent = {
  signals: Set<LodgingSignal>;
  phrases: string[];
};

export function extractLodgingIntent(opts: {
  seedText?: string | null;
  vibe?: string[];
  budgetTier?: string | null;
}): TripLodgingIntent {
  const haystack = [opts.seedText ?? "", ...(opts.vibe ?? []), opts.budgetTier ?? ""].join(" ").toLowerCase();
  const signals = new Set<LodgingSignal>();
  const phrases: string[] = [];
  for (const rule of RULES) {
    if (rule.re.test(haystack)) {
      signals.add(rule.signal);
      phrases.push(rule.phrase);
    }
  }
  // Budget tier reinforces budget/luxury even without explicit words.
  const tier = (opts.budgetTier ?? "").toLowerCase();
  if (/lux|splurge|high/.test(tier)) signals.add("luxury");
  if (/budget|cheap|low/.test(tier)) signals.add("budget");
  return { signals, phrases };
}

/** Build a natural-language aiSearch query from intent + trip facts. */
export function buildAiSearchQuery(opts: {
  destination: string;
  guests: number;
  intent: TripLodgingIntent;
  perNightCapUsd?: number | null;
}): string {
  const lead = opts.intent.signals.has("luxury")
    ? "upscale"
    : opts.intent.signals.has("boutique")
      ? "boutique"
      : opts.intent.signals.has("budget")
        ? "well-rated value"
        : "well-located";
  // De-dup phrases while keeping the lead word out of the tail list.
  const tail = opts.intent.phrases.filter((p) => p !== "upscale" && p !== "boutique" && p !== "great value");
  const parts = [`${lead} hotel in ${opts.destination} for ${Math.max(1, opts.guests)} adults`];
  if (tail.length) parts.push(tail.join(", "));
  if (opts.perNightCapUsd && opts.perNightCapUsd > 0) parts.push(`under $${Math.round(opts.perNightCapUsd)} per night`);
  return parts.join(", ");
}

/** Best-effort per-night USD cap from a free-text budget string ("$200/night", "under 150"). */
export function parsePerNightCap(budgetPerPerson?: string | null, seedText?: string | null): number | null {
  for (const src of [budgetPerPerson, seedText]) {
    if (!src) continue;
    const m = src.match(/\$?\s*(\d{2,4})\s*(?:\/|\s*per\s*)?\s*(?:night|nt|pn)\b/i) || src.match(/under\s*\$?\s*(\d{2,4})/i);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 30 && n <= 5000) return n;
    }
  }
  return null;
}
