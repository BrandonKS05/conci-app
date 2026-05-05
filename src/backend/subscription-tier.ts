import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseSubscriptionTier, type SubscriptionTier } from "@/shared/subscription";

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

/** Temporarily always true for testing — mirrors shared subscriptionTierCanCreateTrips bypass. */
export function userCanCreateTrips(_tier: SubscriptionTier): boolean {
  return true;
}
