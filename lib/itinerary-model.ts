import type { ParsedRequest, ParsedRequestCategory } from "@/lib/request-types";

export type ItineraryBudget = "budget-friendly" | "mid-range" | "premium";

export type ItineraryItemKind = "flight" | "restaurant" | "activity";

export type ItineraryItemStatus = "active" | "removed";

export type ItineraryActionType =
  | "regenerate_all"
  | "make_itinerary_shorter"
  | "adjust_budget"
  | "remove_item"
  | "replace_item"
  | "move_item"
  | "edit_item"
  | "change_guest_count";

export type ItinerarySnapshot = {
  id: string;
  slot_key: string;
  kind: ItineraryItemKind;
  provider_id: string;
  title: string;
  details: string;
  meta: string;
  price: string;
  tone: string;
  position: number;
  status: ItineraryItemStatus;
};

export type ItineraryItem = ItinerarySnapshot;

export type ItinerarySelection = {
  id: string;
  request_id: string;
  itinerary_item_id: string | null;
  status: string;
  created_at: string;
};

export type Itinerary = {
  id: string;
  prompt: string;
  category: ParsedRequestCategory;
  budget: ItineraryBudget;
  guest_count: number;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  time_hint: string | null;
  itinerary_items: ItineraryItem[];
  removed_items: ItinerarySnapshot[];
  selections: ItinerarySelection[];
  parsed_request: ParsedRequest;
  created_at: string;
};

export type ItineraryStore = {
  active_itinerary_id: string | null;
  itineraries: Record<string, Itinerary>;
};

export type ItineraryActionRequest =
  | { type: "regenerate_all" }
  | { type: "make_itinerary_shorter" }
  | { type: "adjust_budget"; budget?: ItineraryBudget }
  | { type: "remove_item"; item_id: string }
  | { type: "replace_item"; item_id: string; replacement_provider_id?: string }
  | { type: "move_item"; item_id: string; direction: -1 | 1 }
  | {
      type: "edit_item";
      item_id: string;
      patch: Partial<Pick<ItineraryItem, "title" | "details" | "meta" | "price" | "tone">>;
    }
  | { type: "change_guest_count"; guest_count: number };

export type ItinerarySeedInput = {
  prompt: string;
  parsed: ParsedRequest;
};
