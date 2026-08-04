/** Stored in `public.profiles.subscription_tier`. */
export type SubscriptionTier = "free" | "host" | "host_pro";

export function parseSubscriptionTier(raw: string | null | undefined): SubscriptionTier {
  if (raw === "host" || raw === "host_pro") return raw;
  return "free";
}

/** Paid hosts can create trips; the free tier (guests) cannot. */
export function subscriptionTierCanCreateTrips(tier: SubscriptionTier): boolean {
  return tier === "host" || tier === "host_pro";
}
