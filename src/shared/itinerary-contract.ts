import type { ParsedRequestCategory } from "@/shared/request-types";
import type { Itinerary, ItineraryActionRequest } from "@/shared/itinerary-model";

export type RequestRow = {
  id: string;
  prompt: string;
  category: ParsedRequestCategory;
  budget: string | null;
  guest_count: number;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
};

export type ItineraryItemRow = {
  id: string;
  request_id: string;
  item_type: "flight" | "restaurant" | "activity";
  title: string;
  details: string;
  position: number;
  created_at: string;
};

export type SelectionRow = {
  id: string;
  request_id: string;
  itinerary_item_id: string | null;
  status: string;
  created_at: string;
};

export type MutationErrorShape = {
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
};

export type CreateItineraryRequest = {
  request?: string;
  parsed?: import("@/shared/request-types").ParsedRequest;
};

export type MutateItineraryRequest = {
  action?: ItineraryActionRequest;
};

export type ItineraryMutationResponse<TItinerary extends Itinerary> = {
  itinerary: TItinerary | null;
  sections: Array<{
    key: string;
    label: string;
    title: string;
    description: string;
    selectedItem: TItinerary extends { itinerary_items: Array<infer TItem> } ? TItem : never;
    alternatives: TItinerary extends { itinerary_items: Array<infer TItem> } ? TItem[] : never;
    index: number;
  }>;
  title: string;
  summaryChips: string[];
};

export type ItineraryApiResponse = ItineraryMutationResponse<Itinerary>;
