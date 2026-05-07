/**
 * Maps common city abbreviations/nicknames to their canonical names.
 * Used by grounding logic to avoid stripping valid locations when the model
 * expands an abbreviation the user typed (e.g. "LA" -> "Los Angeles").
 */

const LOCATION_ALIAS_MAP: Record<string, string[]> = {
  la: ["los angeles"],
  nyc: ["new york", "new york city"],
  sf: ["san francisco"],
  atx: ["austin"],
  nola: ["new orleans"],
  philly: ["philadelphia"],
  dc: ["washington dc", "washington d.c.", "washington"],
  dmv: ["washington dc", "washington d.c."],
  vegas: ["las vegas"],
  chi: ["chicago"],
  bos: ["boston"],
  jax: ["jacksonville"],
  pdx: ["portland"],
  sea: ["seattle"],
  sd: ["san diego"],
  sj: ["san jose"],
  stl: ["st. louis", "saint louis", "st louis"],
  dtw: ["detroit"],
  mia: ["miami"],
  atl: ["atlanta"],
  dfw: ["dallas", "dallas-fort worth", "dallas fort worth"],
  hou: ["houston"],
  phx: ["phoenix"],
  msp: ["minneapolis"],
  den: ["denver"],
  bkk: ["bangkok"],
  hk: ["hong kong"],
  cdmx: ["mexico city", "ciudad de mexico"],
  ba: ["buenos aires"],
  rio: ["rio de janeiro"],
  tb: ["tampa bay", "tampa"],
  kc: ["kansas city"],
  slc: ["salt lake city"],
  socal: ["southern california"],
  norcal: ["northern california"],
};

/**
 * Given a location string from the model (e.g. "Los Angeles, CA"), check whether
 * any token/abbreviation in the user's original text is a known alias for it.
 * Returns true if the model's location is a valid expansion of a user abbreviation.
 */
export function isKnownAliasExpansion(modelLocation: string, userInputLower: string): boolean {
  const locLower = modelLocation.toLowerCase();

  for (const [abbrev, expansions] of Object.entries(LOCATION_ALIAS_MAP)) {
    const abbrevPattern = new RegExp(`(?:^|\\s|[^a-z])${escapeRegex(abbrev)}(?:$|\\s|[^a-z])`, "i");
    if (!abbrevPattern.test(` ${userInputLower} `)) continue;

    for (const expansion of expansions) {
      if (locLower.includes(expansion)) return true;
    }
  }

  return false;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
