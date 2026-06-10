/**
 * True for Google Maps view/search links — places you can look at, not book.
 * Used to keep CTAs honest: a maps link must never be labeled "Book".
 */
export function isGoogleMapsUrl(url: string | null | undefined): boolean {
  if (typeof url !== "string" || !url.startsWith("http")) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === "maps.google.com" || host.startsWith("maps.google.")) return true;
    return /(^|\.)google\.com$/.test(host) && u.pathname.startsWith("/maps");
  } catch {
    return false;
  }
}
