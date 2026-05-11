import { z } from "zod";

const FlightAirportSchema = z
  .object({
    time: z.string().optional(),
    id: z.string().optional(),
    name: z.string().optional(),
  })
  .passthrough();

const FlightLegSchema = z
  .object({
    airline: z.string().optional(),
    airline_logo: z.string().optional(),
    departure_airport: FlightAirportSchema.optional(),
    arrival_airport: FlightAirportSchema.optional(),
  })
  .passthrough();

const FlightOptionSchema = z
  .object({
    flights: z.array(FlightLegSchema).optional(),
    airline_logo: z.string().optional(),
    price: z.union([z.string(), z.number()]).optional(),
    duration: z.union([z.number(), z.string()]).optional(),
    booking_token: z.string().optional(),
    link: z.string().optional(),
  })
  .passthrough();

export const GoogleFlightsSearchResponseSchema = z
  .object({
    best_flights: z.array(FlightOptionSchema).optional(),
    other_flights: z.array(FlightOptionSchema).optional(),
    error: z.string().optional(),
  })
  .passthrough();
