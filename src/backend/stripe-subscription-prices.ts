import "server-only";

import type { SubscriptionTier } from "@/shared/subscription";

/** Map Stripe Price id → tier; requires env vars from the Stripe Dashboard. */
export function tierFromStripePriceId(priceId: string | undefined | null): SubscriptionTier | null {
  if (!priceId?.trim()) return null;
  const host = process.env.STRIPE_PRICE_HOST?.trim();
  const hostPro = process.env.STRIPE_PRICE_HOST_PRO?.trim();
  if (host && priceId === host) return "host";
  if (hostPro && priceId === hostPro) return "host_pro";
  return null;
}

export function checkoutPriceIdForTier(tier: "host" | "host_pro"): string | null {
  const id = tier === "host" ? process.env.STRIPE_PRICE_HOST?.trim() : process.env.STRIPE_PRICE_HOST_PRO?.trim();
  return id || null;
}
