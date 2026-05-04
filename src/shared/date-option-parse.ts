/** Parse `plan.dates.options` strings into local calendar ranges for the dates vote UI. */

export type ParsedDateOption = {
  option: string;
  start: Date;
  end: Date;
};

const MONTH: Record<string, number> = {
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

function normalizeDashes(s: string): string {
  return s.replace(/[\u2013\u2014\u2012]/g, "-").trim();
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function localDayTime(d: Date): number {
  return startOfLocalDay(d).getTime();
}

export function isDayInRange(day: Date, start: Date, end: Date): boolean {
  const t = localDayTime(day);
  return t >= localDayTime(start) && t <= localDayTime(end);
}

function monthFromToken(tok: string): number | null {
  const t = tok.toLowerCase().replace(/\./g, "");
  if (t in MONTH) return MONTH[t]!;
  const full = Object.keys(MONTH).find((k) => k.length > 3 && k.startsWith(t));
  return full != null ? MONTH[full]! : null;
}

function ymd(y: number, m: number, d: number): Date {
  return startOfLocalDay(new Date(y, m, d, 12, 0, 0, 0));
}

/**
 * Prefer an explicit 4-digit year from any option; otherwise use `fallbackYear` (e.g. current year).
 */
export function inferDefaultYearFromDateOptions(opts: string[], fallbackYear: number): number {
  let best = 0;
  for (const o of opts) {
    const ms = o.matchAll(/\b(20[0-9]{2})\b/g);
    for (const m of ms) {
      const y = parseInt(m[1]!, 10);
      if (!Number.isNaN(y)) best = Math.max(best, y);
    }
  }
  return best > 0 ? best : fallbackYear;
}

/**
 * Best-effort parse of a single `plan.dates.options` entry into inclusive local dates.
 */
export function parseDateOptionToRange(opt: string, defaultYear: number): { start: Date; end: Date } | null {
  const raw = normalizeDashes(opt);
  if (!raw || /^TBD\b/i.test(raw)) return null;

  const isoSingle = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoSingle) {
    const y = parseInt(isoSingle[1]!, 10);
    const m = parseInt(isoSingle[2]!, 10) - 1;
    const d = parseInt(isoSingle[3]!, 10);
    if (m >= 0 && m < 12 && d >= 1 && d <= 31) {
      const one = ymd(y, m, d);
      return { start: one, end: one };
    }
  }

  const isoRange = raw.match(
    /^(\d{4}-\d{2}-\d{2})\s*(?:to|-|–)\s*(\d{4}-\d{2}-\d{2})$/i
  );
  if (isoRange) {
    const a = new Date(`${isoRange[1]}T12:00:00`);
    const b = new Date(`${isoRange[2]}T12:00:00`);
    if (!Number.isNaN(a.getTime()) && !Number.isNaN(b.getTime())) {
      const sa = startOfLocalDay(a);
      const sb = startOfLocalDay(b);
      return localDayTime(sa) <= localDayTime(sb) ? { start: sa, end: sb } : { start: sb, end: sa };
    }
  }

  const slash = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*(?:to|-|–)\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/i
  );
  if (slash) {
    let y1 = parseInt(slash[3]!, 10);
    let y2 = parseInt(slash[6]!, 10);
    if (y1 < 100) y1 += 2000;
    if (y2 < 100) y2 += 2000;
    const m1 = parseInt(slash[1]!, 10) - 1;
    const d1 = parseInt(slash[2]!, 10);
    const m2 = parseInt(slash[4]!, 10) - 1;
    const d2 = parseInt(slash[5]!, 10);
    const sa = ymd(y1, m1, d1);
    const sb = ymd(y2, m2, d2);
    return localDayTime(sa) <= localDayTime(sb) ? { start: sa, end: sb } : { start: sb, end: sa };
  }

  const cross = raw.match(
    /^([A-Za-z]+)\s+(\d{1,2})\s*-\s*([A-Za-z]+)\s+(\d{1,2})(?:\s*,\s*(\d{4}))?$/i
  );
  if (cross) {
    const m1 = monthFromToken(cross[1]!);
    const d1 = parseInt(cross[2]!, 10);
    const m2 = monthFromToken(cross[3]!);
    const d2 = parseInt(cross[4]!, 10);
    const y = cross[5] ? parseInt(cross[5], 10) : defaultYear;
    if (m1 != null && m2 != null && d1 >= 1 && d2 >= 1) {
      const sa = ymd(y, m1, d1);
      const sb = ymd(y, m2, d2);
      return localDayTime(sa) <= localDayTime(sb) ? { start: sa, end: sb } : { start: sb, end: sa };
    }
  }

  const sameMo = raw.match(/^([A-Za-z]+)\s+(\d{1,2})\s*-\s*(\d{1,2})(?:\s*,\s*(\d{4}))?$/i);
  if (sameMo) {
    const mon = monthFromToken(sameMo[1]!);
    const dStart = parseInt(sameMo[2]!, 10);
    const dEnd = parseInt(sameMo[3]!, 10);
    const y = sameMo[4] ? parseInt(sameMo[4], 10) : defaultYear;
    if (mon != null && dStart >= 1 && dEnd >= 1) {
      const sa = ymd(y, mon, dStart);
      const sb = ymd(y, mon, dEnd);
      return localDayTime(sa) <= localDayTime(sb) ? { start: sa, end: sb } : { start: sb, end: sa };
    }
  }

  const singleNamed = raw.match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,\s*(\d{4}))?$/i);
  if (singleNamed) {
    const mon = monthFromToken(singleNamed[1]!);
    const d = parseInt(singleNamed[2]!, 10);
    const y = singleNamed[3] ? parseInt(singleNamed[3], 10) : defaultYear;
    if (mon != null && d >= 1) {
      const one = ymd(y, mon, d);
      return { start: one, end: one };
    }
  }

  const native = new Date(raw);
  if (!Number.isNaN(native.getTime())) {
    const one = startOfLocalDay(native);
    return { start: one, end: one };
  }

  return null;
}

export function buildParsedDateOptions(opts: string[], fallbackYear: number): ParsedDateOption[] {
  const y0 = inferDefaultYearFromDateOptions(opts, fallbackYear);
  const out: ParsedDateOption[] = [];
  for (const option of opts) {
    const r = parseDateOptionToRange(option, y0);
    if (r) out.push({ option, start: r.start, end: r.end });
  }
  return out;
}

export function optionForCalendarDay(day: Date, opts: string[], parsed: ParsedDateOption[]): string | null {
  for (const label of opts) {
    const row = parsed.find((p) => p.option === label);
    if (!row) continue;
    if (isDayInRange(day, row.start, row.end)) return row.option;
  }
  return null;
}

/** Local calendar day as YYYY-MM-DD (for per-day availability votes). */
export function formatLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Canonical stored vote for a local-date range (inclusive), sorted by day. */
export function formatLocalIsoRangeVote(start: Date, end: Date): string {
  const a = localDayTime(start) <= localDayTime(end) ? start : end;
  const b = localDayTime(start) <= localDayTime(end) ? end : start;
  return `${formatLocalIsoDate(a)} to ${formatLocalIsoDate(b)}`;
}

export function isRangeContainedIn(
  inner: { start: Date; end: Date },
  outer: { start: Date; end: Date }
): boolean {
  return (
    localDayTime(inner.start) >= localDayTime(outer.start) &&
    localDayTime(inner.end) <= localDayTime(outer.end)
  );
}

export function formatVoteRangeLabel(start: Date, end: Date): string {
  if (localDayTime(start) === localDayTime(end)) {
    return start.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

export function isStrictIsoDateString(s: string): boolean {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const y = parseInt(m[1]!, 10);
  const mo = parseInt(m[2]!, 10) - 1;
  const d = parseInt(m[3]!, 10);
  const dt = new Date(y, mo, d, 12, 0, 0, 0);
  return dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === d;
}

export function isAllowedDateVoteOption(option: string, ballotOptions: string[], fallbackYear: number): boolean {
  const t = option.trim();
  if (!t) return false;
  if (ballotOptions.includes(t)) return true;
  if (isStrictIsoDateString(t)) return true;
  return parseDateOptionToRange(t, fallbackYear) !== null;
}

/** Per-option counts; includes free-form valid date strings (e.g. ISO days) from votes. */
export function tallyDateStringVotes(votes: Record<string, unknown>, ballotOptions: string[]): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const o of ballotOptions) tally[o] = 0;
  for (const v of Object.values(votes)) {
    if (typeof v !== "string" || !v.trim()) continue;
    tally[v] = (tally[v] ?? 0) + 1;
  }
  return tally;
}

/**
 * Votes fully contained in a host-proposed window, plus exact option-string votes.
 * Supports single-day (`YYYY-MM-DD`) and range (`YYYY-MM-DD to YYYY-MM-DD`) keys.
 */
export function aggregatedTallyForBallotOption(
  option: string,
  parsed: ParsedDateOption[],
  rawTally: Record<string, number>,
  fallbackYear: number
): number {
  let n = rawTally[option] ?? 0;
  const row = parsed.find((p) => p.option === option);
  if (!row) return n;
  for (const [key, c] of Object.entries(rawTally)) {
    if (c <= 0 || key === option) continue;
    const r = parseDateOptionToRange(key, fallbackYear);
    if (!r) continue;
    if (isRangeContainedIn(r, { start: row.start, end: row.end })) n += c;
  }
  return n;
}

/** Other date/range votes that are not fully contained in any host suggestion (listed separately). */
export function listCustomVotesOutsideHostSuggestions(
  rawTally: Record<string, number>,
  parsed: ParsedDateOption[],
  ballotOptions: string[],
  fallbackYear: number
): { key: string; votes: number; label: string }[] {
  const out: { key: string; votes: number; label: string }[] = [];
  for (const [key, c] of Object.entries(rawTally)) {
    if (c <= 0) continue;
    if (ballotOptions.includes(key)) continue;
    const r = parseDateOptionToRange(key, fallbackYear);
    if (!r) continue;
    const contained = parsed.some((p) => isRangeContainedIn(r, { start: p.start, end: p.end }));
    if (contained) continue;
    out.push({ key, votes: c, label: formatVoteRangeLabel(r.start, r.end) });
  }
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

/** How many voters’ chosen range(s) include this calendar day. */
export function votesCoveringCalendarDay(
  day: Date,
  rawTally: Record<string, number>,
  fallbackYear: number
): number {
  let sum = 0;
  const tDay = localDayTime(startOfLocalDay(day));
  for (const [key, c] of Object.entries(rawTally)) {
    if (c <= 0) continue;
    const r = parseDateOptionToRange(key, fallbackYear);
    if (!r) continue;
    const a = localDayTime(r.start);
    const b = localDayTime(r.end);
    if (tDay >= a && tDay <= b) sum += c;
  }
  return sum;
}

/** First day of meteorological-ish season windows (helps vague “summer”, “spring” copy). */
const SEASON_START_MONTH: Record<string, number> = {
  spring: 2,
  summer: 5,
  fall: 8,
  autumn: 8,
  winter: 11,
};

const MONTH_NAME_RE =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/gi;

/**
 * When `parseDateOptionToRange` yields nothing useful, infer month/year hints from fuzzy phrases
 * (“late May”, “June-ish”, “summer 2026”, “maybe May or June”).
 */
export function extractLooseCalendarAnchorsFromText(raw: string, defaultYear: number): Date[] {
  const s = normalizeDashes(raw).trim();
  if (!s || /^TBD\b/i.test(s)) return [];

  let y = defaultYear;
  const yMatch = s.match(/\b(20[0-9]{2})\b/);
  if (yMatch) y = parseInt(yMatch[1]!, 10);

  const out: Date[] = [];

  for (const word of Object.keys(SEASON_START_MONTH)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(s)) {
      out.push(ymd(y, SEASON_START_MONTH[word]!, 1));
    }
  }

  const quarter = s.match(/\bQ([1-4])\b/i);
  if (quarter) {
    const qi = parseInt(quarter[1]!, 10);
    const m0 = (qi - 1) * 3;
    out.push(ymd(y, m0, 1));
  }

  MONTH_NAME_RE.lastIndex = 0;
  let mr: RegExpExecArray | null;
  while ((mr = MONTH_NAME_RE.exec(s)) !== null) {
    const mo = monthFromToken(mr[1]!);
    if (mo != null) out.push(ymd(y, mo, 1));
  }

  return out;
}

/** True when a host-style date clue (month/summer/quarter…) in `option` also appears in the user’s wording. Used to keep fuzzy `dates.options` after grounding while still resisting invented dates. */
export function looseDateOptionOverlapsUserText(option: string, userLower: string): boolean {
  const o = normalizeDashes(option);
  MONTH_NAME_RE.lastIndex = 0;
  let mr: RegExpExecArray | null;
  while ((mr = MONTH_NAME_RE.exec(o)) !== null) {
    const needle = mr[1]!.toLowerCase();
    if (needle.length >= 3 && userLower.includes(needle)) return true;
  }

  for (const word of Object.keys(SEASON_START_MONTH)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(o) && new RegExp(`\\b${word}\\b`, "i").test(userLower)) {
      return true;
    }
  }

  const qOpt = o.match(/\bQ([1-4])\b/i);
  if (qOpt && userLower.includes(qOpt[0]!.toLowerCase())) return true;

  return false;
}

/**
 * Prefer the earliest concrete range from ballot options; otherwise open the picker on the first
 * month implied by fuzzy host copy (months, seasons, quarters) across all option strings.
 */
export function inferCalendarOpenDateFromDateOptions(opts: string[], fallbackYear: number): Date {
  const parsed = buildParsedDateOptions(opts, fallbackYear);
  const earlyConcrete = earliestParsedDay(parsed);
  if (earlyConcrete) return startOfLocalDay(earlyConcrete);

  const y0 = inferDefaultYearFromDateOptions(opts, fallbackYear);
  const loose: Date[] = [];
  for (const o of opts) loose.push(...extractLooseCalendarAnchorsFromText(o, y0));
  if (loose.length === 0) return startOfLocalDay(new Date());

  loose.sort((a, b) => localDayTime(a) - localDayTime(b));
  return startOfLocalDay(loose[0]!);
}

export function earliestParsedDay(parsed: ParsedDateOption[]): Date | null {
  if (!parsed.length) return null;
  let t = Infinity;
  let d: Date | null = null;
  for (const p of parsed) {
    const x = localDayTime(p.start);
    if (x < t) {
      t = x;
      d = p.start;
    }
  }
  return d;
}

export function latestParsedDay(parsed: ParsedDateOption[]): Date | null {
  if (!parsed.length) return null;
  let t = -Infinity;
  let d: Date | null = null;
  for (const p of parsed) {
    const x = localDayTime(p.end);
    if (x > t) {
      t = x;
      d = p.end;
    }
  }
  return d;
}
