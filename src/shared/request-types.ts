export type ParsedRequestCategory =
  | "flights"
  | "restaurants"
  | "things_to_do"
  | "travel";

export type ParsedRequest = {
  category: ParsedRequestCategory;
  flow_mode: "single_step" | "multi_step";
  uncertain: boolean;
  fallback_reason: string | null;
  summary: string;
  location: string | null;
  destination: string | null;
  origin: string | null;
  date: string | null;
  date_range: string | null;
  time: string | null;
  budget: string | null;
  party_size: number | null;
  cuisine: string | null;
  vibe: string | null;
  keywords: string[];
};
