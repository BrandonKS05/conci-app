import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseSubscriptionTier,
  subscriptionTierCanCreateTrips,
  type SubscriptionTier,
} from "@/shared/subscription";

export async function fetchSubscriptionTierForUser(
  svc: SupabaseClient,
  userId: string
): Promise<SubscriptionTier> {
  const { data, error } = await svc
    .from("profiles")
    .select("subscription_tier")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[subscription-tier] profiles read failed:", error.message);
    return "free";
  }
  return parseSubscriptionTier(data?.subscription_tier as string | undefined);
}

/** Delegates to the shared gate so entitlement logic lives in one place. */
export function userCanCreateTrips(tier: SubscriptionTier): boolean {
  return subscriptionTierCanCreateTrips(tier);
}
