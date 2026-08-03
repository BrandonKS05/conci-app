/** Read env at request time (no build-time substitution for missing vars). */
export function getEnvTrimmed(name: string): string {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : "";
}

export function getSerpApiKey(): string | undefined {
  const k = getEnvTrimmed("SERPAPI_KEY");
  return k.length ? k : undefined;
}

/** Google Places API (New) — trip live restaurants + experiences (`places:searchText`). */
export function getGooglePlacesApiKey(): string | undefined {
  const k = getEnvTrimmed("GOOGLE_PLACES_API_KEY");
  return k.length ? k : undefined;
}

/** LiteAPI (Nuitée) — hotel search, prebook, and booking. */
export function getLiteApiKey(): string | undefined {
  const k = getEnvTrimmed("LITEAPI_API_KEY");
  return k.length ? k : undefined;
}

export function isLiteApiConfigured(): boolean {
  return !!getLiteApiKey();
}

/**
 * Resolve the LiteAPI environment from the key prefix. Sandbox keys start with
 * `sand_`/`sandbox_`; anything else is treated as live. The Payment SDK's
 * publicKey must match this, so it is derived from the key rather than a flag.
 */
export function getLiteApiEnvironment(): "sandbox" | "live" {
  const k = (getLiteApiKey() ?? "").toLowerCase();
  return k.startsWith("sand_") || k.startsWith("sandbox_") ? "sandbox" : "live";
}

/**
 * Our commission percentage applied to LiteAPI net rates. Override with
 * `LITEAPI_MARGIN_PCT`; defaults to 10. Clamped to a sane 0–40 range.
 */
export function getLiteApiMarginPct(): number {
  const raw = Number(getEnvTrimmed("LITEAPI_MARGIN_PCT"));
  if (!Number.isFinite(raw) || raw <= 0) return 10;
  return Math.min(40, Math.max(0, raw));
}
