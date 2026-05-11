import { z } from "zod";

const TripParserDatesSchema = z.object({
  confirmed: z.boolean(),
  options: z.array(z.string()),
});

const TripParserPeopleSchema = z.object({
  count: z.number().nullable(),
  names: z.array(z.string()),
});

const TripParserBudgetSchema = z.object({
  tier: z.string().nullable(),
  perPerson: z.string().nullable(),
});

/**
 * Runtime contract for model-emitted trip parser JSON before normalization.
 * Keep required fields strict, but allow extra keys from model/tooling.
 */
export const TripParserOutputSchema = z
  .object({
    title: z.string(),
    location: z.string().nullable(),
    departureCity: z.string().nullable().optional(),
    dates: TripParserDatesSchema,
    people: TripParserPeopleSchema,
    budget: TripParserBudgetSchema,
    vibe: z.array(z.string()),
    openDecisions: z.array(z.string()),
    nextStep: z.string().nullable(),
    confidence: z.number(),
  })
  .passthrough();

export type TripParserOutput = z.infer<typeof TripParserOutputSchema>;
