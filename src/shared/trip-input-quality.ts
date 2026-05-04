/** Assistant reply when the first trip message has no real trip substance. */
export const INVALID_TRIP_INPUT_REPLY =
  "Hmm, I didn’t quite catch that! Tell me about your trip — where are you thinking of going and when?";

export const GIBBERISH_SLOT_REPLY =
  "I didn’t quite get that — could you give a bit more detail? (For example a city, dates, or how many people.)";

const TRIP_SIGNAL =
  /\b(go|trip|visit|fly|flying|drive|driving|hotel|resort|airbnb|beach|weekend|vacation|getaway|conference|wedding|birthday|bachelor|bachelorette|family|friends|reunion|days?|nights?|june|july|august|september|october|november|december|january|february|march|april|may|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|\d{4}|spring|summer|fall|winter|ski|hike|cruise|theme park|museum|restaurant|dinner|brunch)\b/i;

const CITYISH =
  /\b(NYC|LA|USA|Miami|Orlando|Vegas|LV|Paris|London|Tokyo|Chicago|Austin|Denver|Seattle|Portland|Boston|Phoenix|Dallas|Houston|Atlanta|Nashville|Charleston|SD|SF|Napa|Palm|Hawaii|Oahu|Maui|Caribbean|Mexico|Canada|Europe|Asia|Florida|California|Texas|Colorado|Hawaii|Utah|Arizona|Georgia|Tennessee|New York|Los Angeles|San Francisco|Washington|DC)\b/i;

const HAS_GEO_OR_MONEY = /\$\d|\d\s*(?:people|guest|person|travelers?|nights?|days?)|\d\s*-\s*\d|\d\+\s*(?:people|guests)/i;

/** Keyboard mash / placeholder — use for slots and coarse first-pass. */
export function isClearlyGibberish(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return true;
  if (t.length <= 2) return true;
  const collapsed = t.replace(/\s+/g, "");
  if (/^(.)\1{4,}$/i.test(collapsed)) return true;

  const alpha = t.replace(/[^a-z]/gi, "");
  if (alpha.length >= 4 && alpha.length <= 20) {
    const vowels = (alpha.match(/[aeiouy]/gi) ?? []).length;
    if (vowels / alpha.length < 0.12) return true;
  }

  if (/^(asdf|qwerty|zxcv|test|foo|bar|abc|aaa|sss|xxx|lol|idk|n\/a|na|null)+$/i.test(collapsed)) return true;
  return false;
}

/**
 * True when the initial trip description looks meaningless (no destination, dates, or trip intent).
 * Skip when user attached images (visual context).
 */
export function looksLikeMeaninglessTripSeed(text: string): boolean {
  const raw = text.trim();
  if (raw.length === 0) return true;

  const body = raw.includes("\n\n") ? raw.split("\n\n").slice(1).join("\n\n").trim() : raw;
  const check = body.length >= 8 ? body : raw;

  if (isClearlyGibberish(check)) return true;

  if (check.length < 18) {
    const hasSignal = TRIP_SIGNAL.test(check) || CITYISH.test(check) || HAS_GEO_OR_MONEY.test(check);
    if (!hasSignal) return true;
  }

  if (check.length < 50) {
    const words = check.split(/\s+/).filter(Boolean);
    const unique = new Set(words.map((w) => w.toLowerCase()));
    if (words.length >= 4 && unique.size <= 2) return true;
  }

  return false;
}
