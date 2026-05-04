/** Richer pick/binary votes: primary choice (`v`) + optional “not for me” (`a`). */

export const PICK_V_CHOICE_KEY = "v";
export const PICK_V_AGAINST_KEY = "a";

export const POLL_WRITE_IN_MAX_LEN = 80;

export function coerceScalarVoteChoice(v: unknown): string | null {
  if (typeof v === "string") return v.length ? v : null;
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const inner = o[PICK_V_CHOICE_KEY];
  if (typeof inner === "string" && inner.trim()) return inner.trim();
  return null;
}

export function coerceVoteAgainstList(v: unknown): string[] {
  if (!v || typeof v !== "object" || Array.isArray(v)) return [];
  const o = v as Record<string, unknown>;
  const a = o[PICK_V_AGAINST_KEY];
  if (!Array.isArray(a)) return [];
  const out: string[] = [];
  for (const x of a) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (!t || out.includes(t)) continue;
    out.push(t);
    if (out.length >= 12) break;
  }
  return out;
}

export function isAllowedPollWriteIn(text: string, ballotOptions: readonly string[]): boolean {
  const t = text.trim();
  if (t.length < 1 || t.length > POLL_WRITE_IN_MAX_LEN) return false;
  if (ballotOptions.includes(t)) return true;
  if (/^__+/u.test(t)) return false;
  if (/[\r\n<>]/.test(t)) return false;
  return true;
}

export function sanitizeAgainstOptions(
  raw: unknown,
  allowed: ReadonlySet<string>
): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (!allowed.has(t)) continue;
    if (out.includes(t)) continue;
    out.push(t);
    if (out.length >= allowed.size) break;
  }
  return out;
}

export function bundlePickVote(canonical: string, against: string[]): string | Record<string, unknown> {
  const a = [...new Set(against.filter(Boolean))];
  if (a.length === 0) return canonical;
  return { [PICK_V_CHOICE_KEY]: canonical, [PICK_V_AGAINST_KEY]: a };
}
