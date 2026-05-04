import type { PlacePreview } from "@/shared/place-preview";

export type PlaceSearchConfirmedEvent = {
  kind: "confirmed";
  query: string;
  message: string;
  place: PlacePreview;
};

export type PlaceSearchDisambiguateEvent = {
  kind: "disambiguate";
  query: string;
  message: string;
  options: PlacePreview[];
};

export type PlaceSearchEvent = PlaceSearchConfirmedEvent | PlaceSearchDisambiguateEvent;

export type PlacePreviewResponse = {
  events: PlaceSearchEvent[];
};
