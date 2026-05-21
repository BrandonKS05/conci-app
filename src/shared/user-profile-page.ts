import type { UserProfilePayload } from "@/shared/social-profile";

export type PriceRangeHotel = "$" | "$$" | "$$$";

export type ProfileHotel = {
  id: string;
  name: string;
  location: string;
  /** 1–10 personal ranking (stored in the `starRating` DB column). */
  starRating: number;
  note: string;
  priceRange?: PriceRangeHotel;
  order: number;
  photoUrl?: string | null;
};

export type ProfileCity = {
  id: string;
  city: string;
  country: string;
  note: string;
  order: number;
  photoUrl?: string | null;
};

export type ProfileRecentTrip = {
  id: string;
  title: string;
  location: string | null;
  datesLabel: string;
  coverImageUrl: string | null;
  memberInitials: string[];
};

export type FullUserProfilePayload = UserProfilePayload & {
  bio: string;
  location: string;
  bannerUrl: string | null;
  visitCount: number;
  hotels: ProfileHotel[];
  cities: ProfileCity[];
  recentTrips: ProfileRecentTrip[];
  /** When false, other users cannot see the recently joined trips section. */
  recentTripsPublic: boolean;
};
