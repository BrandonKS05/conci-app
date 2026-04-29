import type { Itinerary, ItineraryItem } from "@/lib/itinerary-model";

export type ItinerarySection = {
  key: string;
  label: string;
  title: string;
  description: string;
  selectedItem: ItineraryItem;
  alternatives: ItineraryItem[];
  index: number;
};

export type ItineraryScreenData = {
  itinerary: Itinerary;
  sections: ItinerarySection[];
  title: string;
  summaryChips: string[];
};

