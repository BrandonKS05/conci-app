/**
 * Build a same-origin proxy URL for Places Photo Media (never embed GOOGLE_PLACES_API_KEY client-side).
 * @see https://developers.google.com/maps/documentation/places/web-service/media
 */
export function isValidGooglePlacesPhotoResourceName(name: string): boolean {
  if (name.length > 512 || name.length < 24) return false;
  const parts = name.split("/");
  if (parts.length !== 4 || parts[0] !== "places" || parts[2] !== "photos") return false;
  const placeId = parts[1];
  const photoRef = parts[3];
  if (!placeId || !photoRef) return false;
  return /^[A-Za-z0-9_-]+$/.test(placeId) && /^[A-Za-z0-9_-]+$/.test(photoRef);
}

export function googlePlaceFirstPhotoProxyPath(photos: unknown): string | undefined {
  if (!Array.isArray(photos) || photos.length === 0) return undefined;
  const first = photos[0];
  if (!first || typeof first !== "object") return undefined;
  const name = (first as { name?: unknown }).name;
  if (typeof name !== "string" || !isValidGooglePlacesPhotoResourceName(name)) return undefined;
  return `/api/places/photo-media?name=${encodeURIComponent(name)}`;
}
