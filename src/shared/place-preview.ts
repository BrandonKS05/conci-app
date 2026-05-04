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

/** User-confirmed venue from chat (saved on plan, shown on card). */
export type PlaceSpotlight = PlacePreview & {
  sourceQuery?: string;
};
