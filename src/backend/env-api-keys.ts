/** Read env at request time (no build-time substitution for missing vars). */
export function getEnvTrimmed(name: string): string {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : "";
}

export function getSerpApiKey(): string | undefined {
  const k = getEnvTrimmed("SERPAPI_KEY");
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

/**
 * Tripadvisor COM (Things4u / ntd119 on RapidAPI).
 * Default: `tripadvisor-com1.p.rapidapi.com` — override with `RAPIDAPI_TRIPADVISOR_HOST` if needed.
 */
export function getRapidApiTripadvisorHost(): string {
  const h = getEnvTrimmed("RAPIDAPI_TRIPADVISOR_HOST");
  return h.length ? h : "tripadvisor-com1.p.rapidapi.com";
}

/** Search path — Tripadvisor COM on RapidAPI uses category-specific routes; `/locations/search` is not always exposed. */
export function getRapidApiTripadvisorSearchPath(): string {
  const p = getEnvTrimmed("RAPIDAPI_TRIPADVISOR_PATH");
  return p.length ? p : "/attractions/search";
}

/** Optional backup activities provider (Travel Info API or similar on RapidAPI). */
export function getRapidApiTravelInfoHost(): string | undefined {
  const h = getEnvTrimmed("RAPIDAPI_TRAVEL_INFO_HOST");
  return h.length ? h : undefined;
}

export function getRapidApiTravelInfoPath(): string {
  const p = getEnvTrimmed("RAPIDAPI_TRAVEL_INFO_PATH");
  return p.length ? p : "/search";
}

/** Amadeus Tours & Activities on RapidAPI — X-RapidAPI-Host from playground (optional if you use Musement/Tripadvisor only). */
export function getRapidApiAmadeusHost(): string | undefined {
  const h = getEnvTrimmed("RAPIDAPI_AMADEUS_HOST");
  return h.length ? h : undefined;
}

export function getRapidApiAmadeusActivitiesPath(): string | undefined {
  const p = getEnvTrimmed("RAPIDAPI_AMADEUS_PATH");
  return p.length ? p : undefined;
}

export function getRapidApiMusementHost(): string | undefined {
  const h = getEnvTrimmed("RAPIDAPI_MUSEMENT_HOST");
  return h.length ? h : undefined;
}

export function getRapidApiMusementPath(): string | undefined {
  const p = getEnvTrimmed("RAPIDAPI_MUSEMENT_PATH");
  return p.length ? p : undefined;
}

export function getRapidApiActivitiesHost(): string | undefined {
  const h = getEnvTrimmed("RAPIDAPI_ACTIVITIES_HOST");
  return h.length ? h : undefined;
}

export function getRapidApiActivitiesPath(): string | undefined {
  const p = getEnvTrimmed("RAPIDAPI_ACTIVITIES_PATH");
  return p.length ? p : undefined;
}
