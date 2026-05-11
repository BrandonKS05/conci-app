import { z } from "zod";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const TripPlanCreateBodySchema = z.object({
  id: z.string().regex(UUID_RE).optional(),
  plan: z.record(z.string(), z.unknown()),
  seedText: z.string().nullable().optional(),
  hostSetupDraft: z.boolean().optional(),
});

export type TripPlanCreateBody = z.infer<typeof TripPlanCreateBodySchema>;
