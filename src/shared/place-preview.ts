export type PlacePreview = {
  name: string;
  rating?: number;
  reviewCount?: number;
  address?: string;
  priceRange?: string;
  photoUrl?: string | null;
  mapsUrl: string;
};

export type PlacePreviewBlock = {
  query: string;
  items: PlacePreview[];
};

export type SpotlightVenueKind = "hotel" | "restaurant" | "experience";

/** User-confirmed venue from chat (saved on plan, shown on card). */
export type PlaceSpotlight = PlacePreview & {
  sourceQuery?: string;
  /** Saved when known (publish fold, card flows); UI falls back to inference. */
  spotlightCategory?: SpotlightVenueKind;
};
