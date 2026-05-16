import type { UserProfilePayload } from "@/shared/social-profile";

export const EXPERIENCE_CATEGORIES = [
  "Food",
  "Adventure",
  "Culture",
  "Nightlife",
  "Nature",
  "Wellness",
] as const;

export type ExperienceCategory = (typeof EXPERIENCE_CATEGORIES)[number];

export type PriceRangeHotel = "$" | "$$" | "$$$";
export type PriceRangeRestaurant = "$" | "$$" | "$$$" | "$$$$";

export type ProfileHotel = {
  id: string;
  name: string;
  location: string;
  starRating: number;
  note: string;
  priceRange?: PriceRangeHotel;
  order: number;
};

export type ProfileExperience = {
  id: string;
  name: string;
  location: string;
  score: number;
  review: string;
  category: ExperienceCategory;
};

export type ProfileRestaurant = {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  cuisine: string;
  score: number;
  note: string;
  priceRange: PriceRangeRestaurant;
  order: number;
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
  experiences: ProfileExperience[];
  restaurants: ProfileRestaurant[];
  recentTrips: ProfileRecentTrip[];
};

export function scorePillClasses(score: number): string {
  if (score >= 9) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300";
  if (score >= 7) return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200";
  if (score >= 5) return "bg-orange-100 text-orange-900 dark:bg-orange-950/50 dark:text-orange-300";
  return "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-300";
}

export function clampScore(score: number): number {
  const n = Math.round(score * 2) / 2;
  return Math.min(10, Math.max(1, n));
}
