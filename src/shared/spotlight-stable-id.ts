/** Stable id for a spotlight row from its Maps URL (used for votes / browse / replace). */
export function spotlightStableIdFromMapsUrl(mapsUrl: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < mapsUrl.length; i++) {
    h ^= mapsUrl.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `sp-${h.toString(16)}`;
}
