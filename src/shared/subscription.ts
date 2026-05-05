/** Stored in `public.profiles.subscription_tier`. */
export type SubscriptionTier = "free" | "host" | "host_pro";

export function parseSubscriptionTier(raw: string | null | undefined): SubscriptionTier {
  if (raw === "host" || raw === "host_pro") return raw;
  return "free";
}

/** Temporarily always true for testing — re-enable paid tiers before launch. */
export function subscriptionTierCanCreateTrips(_tier: SubscriptionTier): boolean {
  return true;
}
