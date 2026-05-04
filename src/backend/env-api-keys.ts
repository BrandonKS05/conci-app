/** Read env at request time (no build-time substitution for missing vars). */
export function getEnvTrimmed(name: string): string {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : "";
}

export function getSerpApiKey(): string | undefined {
  const k = getEnvTrimmed("SERPAPI_KEY");
  return k.length ? k : undefined;
}

/** Optional RapidAPI host for an OpenTable-oriented product (same key as `RAPIDAPI_KEY`). */
export function getRapidApiOpenTableHost(): string | undefined {
  const h = getEnvTrimmed("RAPIDAPI_OPENTABLE_HOST");
  return h.length ? h : undefined;
}

/** Path on OpenTable RapidAPI host (default tries common patterns in fetcher). */
export function getRapidApiOpenTableSearchPath(): string | undefined {
  const p = getEnvTrimmed("RAPIDAPI_OPENTABLE_PATH");
  return p.length ? p : undefined;
}

/** RapidAPI X-RapidAPI-Host for Amadeus Tours & Activities (same key as RAPIDAPI_KEY). */
export function getRapidApiAmadeusHost(): string | undefined {
  const h = getEnvTrimmed("RAPIDAPI_AMADEUS_HOST");
  return h.length ? h : undefined;
}

/** Optional path override (default `/v1/shopping/activities` in fetcher). */
export function getRapidApiAmadeusActivitiesPath(): string | undefined {
  const p = getEnvTrimmed("RAPIDAPI_AMADEUS_PATH");
  return p.length ? p : undefined;
}

/** Musement or other RapidAPI “activities” product (same RAPIDAPI_KEY). */
export function getRapidApiMusementHost(): string | undefined {
  const h = getEnvTrimmed("RAPIDAPI_MUSEMENT_HOST");
  return h.length ? h : undefined;
}

export function getRapidApiMusementPath(): string | undefined {
  const p = getEnvTrimmed("RAPIDAPI_MUSEMENT_PATH");
  return p.length ? p : undefined;
}

/** Generic alias when the subscribed product is neither Amadeus nor Musement-branded. */
export function getRapidApiActivitiesHost(): string | undefined {
  const h = getEnvTrimmed("RAPIDAPI_ACTIVITIES_HOST");
  return h.length ? h : undefined;
}

export function getRapidApiActivitiesPath(): string | undefined {
  const p = getEnvTrimmed("RAPIDAPI_ACTIVITIES_PATH");
  return p.length ? p : undefined;
}

/** Host for experiences: Musement, generic activities, or Amadeus (first set wins). */
export function getRapidApiExperiencesHost(): string | undefined {
  return (
    getRapidApiMusementHost() ??
    getRapidApiActivitiesHost() ??
    getRapidApiAmadeusHost() ??
    undefined
  );
}

export function getRapidApiExperiencesActivitiesPath(): string | undefined {
  return (
    getRapidApiMusementPath() ??
    getRapidApiActivitiesPath() ??
    getRapidApiAmadeusActivitiesPath() ??
    undefined
  );
}
