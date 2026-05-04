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
