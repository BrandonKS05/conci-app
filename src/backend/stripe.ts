import "server-only";

import Stripe from "stripe";

/**
 * Stripe server SDK — **only** this env var is used for the secret key:
 * - `STRIPE_SECRET_KEY` (trimmed). Optional related vars elsewhere: `STRIPE_WEBHOOK_SECRET`,
 *   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (publishable key is for browser/Stripe.js only).
 *
 * Next.js injects `.env.local`, `.env`, `.env.development`, etc. into `process.env` for the
 * **Node server** — there is no separate API to “read .env.local”; restarting `next dev`
 * after changing env files is required.
 */
let stripeInstance: Stripe | null = null;
let stripeInstanceKey: string | null = null;

export function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    stripeInstance = null;
    stripeInstanceKey = null;
    return null;
  }

  if (!stripeInstance || stripeInstanceKey !== key) {
    stripeInstance = new Stripe(key);
    stripeInstanceKey = key;
  }
  return stripeInstance;
}
