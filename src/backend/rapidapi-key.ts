/**
 * Read RapidAPI key at **request time** using bracket notation so Next.js does not
 * substitute `undefined` when the var was missing at `next build` time.
 *
 * Accepts common alternate names if the key was added under a different variable.
 */
function normalizeSecret(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let s = raw.trim();
  // Common .env mistake: RAPIDAPI_KEY="abcdef" — strip one layer of wrapping quotes.
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/** Strip BOM from env *variable names* (UTF-8 `.env` with BOM can prefix the first line). */
function normalizeEnvVarName(name: string): string {
  return name.replace(/^\uFEFF/g, "").trim();
}

/**
 * Find a value when the exact name is missing but a BOM-prefixed or odd key matches
 * (e.g. `\uFEFFRAPIDAPI_KEY`).
 */
function findEnvEntryByCanonicalName(canonical: string): { rawKey: string; value: string } | undefined {
  const want = canonical.toUpperCase();
  for (const [rawKey, val] of Object.entries(process.env)) {
    if (typeof val !== "string") continue;
    if (normalizeEnvVarName(rawKey).toUpperCase() === want) {
      return { rawKey, value: val };
    }
  }
  return undefined;
}

export function getRapidApiKey(): string | undefined {
  const keys = ["RAPIDAPI_KEY", "RAPID_API_KEY"] as const;
  for (const name of keys) {
    const direct = normalizeSecret(process.env[name]);
    if (direct.length > 0) return direct;
    const found = findEnvEntryByCanonicalName(name);
    if (found) {
      const t = normalizeSecret(found.value);
      if (t.length > 0) return t;
    }
  }
  return undefined;
}

/** Safe for logs — never includes the full key. */
export type RapidApiKeyDiagnostics = {
  present: boolean;
  source: "RAPIDAPI_KEY" | "RAPID_API_KEY" | null;
  /** Last 4 characters when present (confirms env loaded without leaking the secret). */
  keySuffix: string | null;
  keyLength: number;
  /** Set when the value was resolved by scanning `process.env` (e.g. BOM in key name). */
  matchedRawKeyName?: string;
};

export function getRapidApiKeyDiagnostics(): RapidApiKeyDiagnostics {
  const keys = ["RAPIDAPI_KEY", "RAPID_API_KEY"] as const;
  for (const name of keys) {
    const direct = normalizeSecret(process.env[name]);
    if (direct.length > 0) {
      return {
        present: true,
        source: name,
        keySuffix: direct.length >= 4 ? direct.slice(-4) : "****",
        keyLength: direct.length,
      };
    }
    const found = findEnvEntryByCanonicalName(name);
    if (found) {
      const t = normalizeSecret(found.value);
      if (t.length > 0) {
        return {
          present: true,
          source: name,
          keySuffix: t.length >= 4 ? t.slice(-4) : "****",
          keyLength: t.length,
          matchedRawKeyName:
            found.rawKey !== name ? JSON.stringify(found.rawKey) : undefined,
        };
      }
    }
  }
  return { present: false, source: null, keySuffix: null, keyLength: 0 };
}

/** Names of env vars that look RapidAPI-related (for debugging typos). */
export function rapidApiRelatedEnvKeys(): string[] {
  return Object.keys(process.env).filter((k) => /rapid/i.test(k));
}

export function isRapidApiHotelsConfigured(): boolean {
  return !!getRapidApiKey();
}
