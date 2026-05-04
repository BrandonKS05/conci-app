/** Read env at request time (no build-time substitution for missing vars). */
export function getEnvTrimmed(name: string): string {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : "";
}

export function getSerpApiKey(): string | undefined {
  const k = getEnvTrimmed("SERPAPI_KEY");
  return k.length ? k : undefined;
}

/** Google Places API (New) — Text Search for trip “Top experiences”. */
export function getGooglePlacesApiKey(): string | undefined {
  const k = getEnvTrimmed("GOOGLE_PLACES_API_KEY");
  return k.length ? k : undefined;
}

/**
 * X-RapidAPI-Host for OpenTable Data API (elis-lab on RapidAPI).
 * Default: `opentable-data-api.p.rapidapi.com` — override with `RAPIDAPI_OPENTABLE_HOST` if your subscription differs.
 */
export function getRapidApiOpenTableHost(): string {
  const h = getEnvTrimmed("RAPIDAPI_OPENTABLE_HOST");
  return h.length ? h : "opentable-data-api.p.rapidapi.com";
}

/** Path on OpenTable Data API host (default `/restaurants` per elis-lab listing). */
export function getRapidApiOpenTableSearchPath(): string {
  const p = getEnvTrimmed("RAPIDAPI_OPENTABLE_PATH");
  return p.length ? p : "/restaurants";
}
