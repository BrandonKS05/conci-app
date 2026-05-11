import { z } from "zod";

export const StripeSubscriptionCheckoutMetadataSchema = z
  .object({
    kind: z.literal("subscription"),
    user_id: z.string(),
    tier: z.enum(["host", "host_pro"]),
  })
  .passthrough();

export const StripeDepositCheckoutMetadataSchema = z
  .object({
    deposit_id: z.string(),
  })
  .passthrough();
