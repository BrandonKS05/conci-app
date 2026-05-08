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

/** Map en-dash, em-dash, figure dash, minus sign (U+2212) → ASCII hyphen so range splitters match `-`. */
function normalizeDashes(s: string): string {
  return s.replace(/[\u2013\u2014\u2012\u2212]/g, "-").trim();
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

function daysInCalendarMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

/** Longest token first so `september` wins over `sep`. */
const MONTH_NAME_KEYS_BY_LENGTH = Object.keys(MONTH).sort((a, b) => b.length - a.length);

/**
 * Vague host/phrasing: "late July", "mid June", "early August", "sometime in September", or a bare month.
 * Does not match season-only strings (no month word).
 */
export function parseVagueMonthQualifierToRange(
  raw: string,
  defaultYear: number
): { start: Date; end: Date } | null {
  const s = normalizeDashes(raw);
  if (!s || /^TBD\b/i.test(s)) return null;

  let y = defaultYear;
  const yMatch = s.match(/\b(20[0-9]{2})\b/);
  if (yMatch) y = parseInt(yMatch[1]!, 10);

  let bestPos = Infinity;
  let monthIdx: number | null = null;
  for (const key of MONTH_NAME_KEYS_BY_LENGTH) {
    const re = new RegExp(`\\b${key}\\b`, "i");
    const m = s.match(re);
    if (m?.index !== undefined && m.index < bestPos) {
      bestPos = m.index;
      monthIdx = MONTH[key]!;
    }
  }
  if (monthIdx === null) return null;

  const dim = daysInCalendarMonth(y, monthIdx);

  if (/\b(early|beginning of|start of)\b/i.test(s)) {
    return { start: ymd(y, monthIdx, 1), end: ymd(y, monthIdx, Math.min(10, dim)) };
  }
  if (/\b(mid|middle of)\b/i.test(s)) {
    return { start: ymd(y, monthIdx, 10), end: ymd(y, monthIdx, Math.min(20, dim)) };
  }
  if (/\b(late|end of)\b/i.test(s)) {
    return { start: ymd(y, monthIdx, 20), end: ymd(y, monthIdx, dim) };
  }
  if (/\bsometime\s+in\b/i.test(s)) {
    return { start: ymd(y, monthIdx, 1), end: ymd(y, monthIdx, dim) };
  }

  return { start: ymd(y, monthIdx, 1), end: ymd(y, monthIdx, dim) };
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
 * Explicit calendar dates only (ISO, slash ranges, month+day text with numeric days).
 * Does not use the loose `new Date(string)` fallback so vague copy ("summer", "May") won’t become a range.
 */
export function parseConcreteDateOptionToRange(
  opt: string,
  defaultYear: number
): { start: Date; end: Date } | null {
  const raw = normalizeDashes(opt);
  if (!raw || /^TBD\b/i.test(raw)) return null;
  return parseDateOptionToRangeStructured(raw, defaultYear);
}

/**
 * Best-effort parse of a single `plan.dates.options` entry into inclusive local dates.
 * Includes a final `new Date(raw)` fallback for fuzzy strings that still parse.
 */
export function parseDateOptionToRange(opt: string, defaultYear: number): { start: Date; end: Date } | null {
  const raw = normalizeDashes(opt);
  if (!raw || /^TBD\b/i.test(raw)) return null;
  const structured = parseDateOptionToRangeStructured(raw, defaultYear);
  if (structured) return structured;
  const native = new Date(raw);
  if (!Number.isNaN(native.getTime())) {
    const one = startOfLocalDay(native);
    return { start: one, end: one };
  }
  /**
   * Vague-month expansion only when no ISO yyyy-mm-dd appears in the blob.
   * Otherwise “July…” + embedded ISO anchors would incorrectly widen to full calendar months after structured parse misses.
   */
  if (uniqIsoDaysInText(raw).length === 0) {
    const vague = parseVagueMonthQualifierToRange(raw, defaultYear);
    if (vague) return vague;
  }
  return null;
}

/** ISO / slash / named month+day patterns shared by concrete and loose parsing. */
const MAX_INFERRED_TRIP_SPAN_DAYS = 366;

/** Extract unique ISO yyyy-mm-dd tokens in source order appearances. */
function uniqueIsoDaysInText(s: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of s.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)) {
    const tok = m[1]!;
    if (seen.has(tok)) continue;
    seen.add(tok);
    out.push(tok);
  }
  return out;
}

function isoStringsToInclusiveRange(aIso: string, bIso: string): { start: Date; end: Date } | null {
  const a = new Date(`${aIso}T12:00:00`);
  const b = new Date(`${bIso}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  let sa = startOfLocalDay(a);
  let sb = startOfLocalDay(b);
  if (localDayTime(sa) > localDayTime(sb)) [sa, sb] = [sb, sa];
  const spanDays = (localDayTime(sb) - localDayTime(sa)) / (24 * 60 * 60 * 1000);
  if (spanDays > MAX_INFERRED_TRIP_SPAN_DAYS) return null;
  return { start: sa, end: sb };
}

function parseDateOptionToRangeStructured(
  raw: string,
  defaultYear: number
): { start: Date; end: Date } | null {
  /** Model copy often wraps ISO anchors (“…2026-07-10 through 2026-07-15…”) — grab first explicit pair inline. */
  const isoPairKw = /\b(\d{4}-\d{2}-\d{2})\b\s*(?:to|through|thru|until|→)\s*\b(\d{4}-\d{2}-\d{2})\b/i.exec(
    raw
  );
  if (isoPairKw) {
    const r = isoStringsToInclusiveRange(isoPairKw[1]!, isoPairKw[2]!);
    if (r) return r;
  }
  const isoPairHyphen = /\b(\d{4}-\d{2}-\d{2})\b\s*[–\-—]\s*\b(\d{4}-\d{2}-\d{2})\b/.exec(raw);
  if (isoPairHyphen) {
    const r = isoStringsToInclusiveRange(isoPairHyphen[1]!, isoPairHyphen[2]!);
    if (r) return r;
  }

  /** Exactly two ISO mentions in one option string → treat as trip window (distinct from vague “July”). */
  const uniqIso = uniqueIsoDaysInText(raw);
  if (uniqIso.length === 2) {
    const sortedPair = [...uniqIso].sort();
    const one = sortedPair[0];
    const two = sortedPair[1];
    if (one != null && two != null) {
      const pair = isoStringsToInclusiveRange(one, two);
      if (pair) return pair;
    }
  }

  /** Single anchored calendar day buried in prose. */
  if (uniqIso.length === 1 && uniqIso[0]) {
    const r = isoStringsToInclusiveRange(uniqIso[0], uniqIso[0]);
    if (r) return r;
  }

  /** “Flexible — July 10-21, 2026”: must not rely on leading `^` so ISO-in-prose beats vague month widening. */
  const relaxedMoSpan =
    /\b([A-Za-z]+)\s+(\d{1,2})\s*[-–]\s*(\d{1,2})(?:\s*,\s*(\d{4}))?\b/i.exec(raw);
  if (relaxedMoSpan) {
    const mon = monthFromToken(relaxedMoSpan[1]!);
    const dStart = parseInt(relaxedMoSpan[2]!, 10);
    const dEnd = parseInt(relaxedMoSpan[3]!, 10);
    const y = relaxedMoSpan[4] ? parseInt(relaxedMoSpan[4], 10) : defaultYear;
    if (mon != null && dStart >= 1 && dEnd >= 1 && !Number.isNaN(y)) {
      const sa = ymd(y, mon, dStart);
      const sb = ymd(y, mon, dEnd);
      return localDayTime(sa) <= localDayTime(sb) ? { start: sa, end: sb } : { start: sb, end: sa };
    }
  }

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
    /^(\d{4}-\d{2}-\d{2})\s*(?:to|through|thru|until|-|–)\s*(\d{4}-\d{2}-\d{2})$/i
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
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*(?:to|-)\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/i
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

  /** e.g. `Jun 23, 2026 – Jun 29, 2026` (en-dash normalized to `-` above) */
  const mdyRangeBothYears = raw.match(
    /^([A-Za-z]+)\s+(\d{1,2}),\s*(20[0-9]{2})\s*-\s*([A-Za-z]+)\s+(\d{1,2}),\s*(20[0-9]{2})$/i
  );
  if (mdyRangeBothYears) {
    const m1 = monthFromToken(mdyRangeBothYears[1]!);
    const d1 = parseInt(mdyRangeBothYears[2]!, 10);
    const y1 = parseInt(mdyRangeBothYears[3]!, 10);
    const m2 = monthFromToken(mdyRangeBothYears[4]!);
    const d2 = parseInt(mdyRangeBothYears[5]!, 10);
    const y2 = parseInt(mdyRangeBothYears[6]!, 10);
    if (m1 != null && m2 != null && d1 >= 1 && d2 >= 1) {
      const sa = ymd(y1, m1, d1);
      const sb = ymd(y2, m2, d2);
      return localDayTime(sa) <= localDayTime(sb) ? { start: sa, end: sb } : { start: sb, end: sa };
    }
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

/** True when the ballot line maps to an actual calendar range/day (includes vague month phrases like “late July”). */
export function isParsableConcreteDateBallotLine(option: string, fallbackYear: number): boolean {
  return parseDateOptionToRange(option.trim(), fallbackYear) !== null;
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

/** Heading for vote UI — short month/day/year; falls back to raw text if unparseable. */
export function formatBallotProposalHeading(option: string, defaultYear: number): string {
  const raw = option.trim();
  if (!raw) return raw;
  const r = parseDateOptionToRange(raw, defaultYear);
  if (!r) return raw;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (localDayTime(r.start) === localDayTime(r.end)) {
    return r.start.toLocaleDateString("en-US", opts);
  }
  return `${r.start.toLocaleDateString("en-US", opts)} – ${r.end.toLocaleDateString("en-US", opts)}`;
}

/** True when a member’s dates vote matches any host ballot line (same calendar range). */
export function dateVoteMatchesHostBallot(
  voteRaw: unknown,
  hostOptions: string[],
  fallbackYear: number
): boolean {
  if (typeof voteRaw !== "string") return false;
  const y0 = inferDefaultYearFromDateOptions(hostOptions, fallbackYear);
  const raw = voteRaw.trim();
  if (!raw) return false;
  const vr = parseDateOptionToRange(raw, y0);
  if (!vr) return false;
  for (const o of hostOptions) {
    const h = parseDateOptionToRange(String(o).trim(), y0);
    if (
      h &&
      localDayTime(h.start) === localDayTime(vr.start) &&
      localDayTime(h.end) === localDayTime(vr.end)
    ) {
      return true;
    }
  }
  return false;
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
  if (loose.length === 0) {
    const ym = inferYearMonthFromDateOptionsHints(opts, fallbackYear);
    if (ym) {
      return startOfLocalDay(new Date(ym.year, ym.month, 1, 12, 0, 0, 0));
    }
    return startOfLocalDay(new Date());
  }

  loose.sort((a, b) => localDayTime(a) - localDayTime(b));
  return startOfLocalDay(loose[0]!);
}

/**
 * Year + month (0–11) to open a calendar on when there is no ISO trip range yet.
 * Uses parsed ranges, vague month phrases, then seasons / quarters / loose month tokens.
 */
export function inferYearMonthFromDateOptionsHints(
  opts: string[],
  fallbackYear: number
): { year: number; month: number } | null {
  if (!opts.length) return null;
  const y0 = inferDefaultYearFromDateOptions(opts, fallbackYear);
  for (const o of opts) {
    const t = typeof o === "string" ? o.trim() : "";
    if (!t) continue;
    const r = parseDateOptionToRange(t, y0);
    if (r) return { year: r.start.getFullYear(), month: r.start.getMonth() };
  }
  const joined = opts.map((o) => String(o).trim()).filter(Boolean).join("; ");
  if (joined) {
    const rj = parseDateOptionToRange(joined, y0);
    if (rj) return { year: rj.start.getFullYear(), month: rj.start.getMonth() };
  }
  const spaceJoined = opts.join(" ");
  if (spaceJoined && spaceJoined !== joined) {
    const rs = parseDateOptionToRange(spaceJoined, y0);
    if (rs) return { year: rs.start.getFullYear(), month: rs.start.getMonth() };
  }

  const anchors: Date[] = [];
  for (const o of opts) anchors.push(...extractLooseCalendarAnchorsFromText(o, y0));
  if (anchors.length > 0) {
    anchors.sort((a, b) => localDayTime(a) - localDayTime(b));
    const a = anchors[0]!;
    return { year: a.getFullYear(), month: a.getMonth() };
  }
  return null;
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
