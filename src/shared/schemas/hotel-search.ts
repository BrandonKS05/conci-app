import { z } from "zod";

const HotelDestinationRowSchema = z
  .object({
    search_type: z.string().optional(),
    type: z.string().optional(),
    dest_id: z.union([z.string(), z.number()]).optional(),
    destId: z.union([z.string(), z.number()]).optional(),
    destination_id: z.union([z.string(), z.number()]).optional(),
    name: z.string().optional(),
    label: z.string().optional(),
    city_name: z.string().optional(),
  })
  .passthrough();

export const HotelDestinationSearchResponseSchema = z
  .object({
    data: z.array(HotelDestinationRowSchema).optional(),
    results: z.array(HotelDestinationRowSchema).optional(),
  })
  .passthrough();

const HotelSearchRowSchema = z.record(z.string(), z.unknown());

const HotelSearchContainerSchema = z
  .object({
    hotels: z.array(HotelSearchRowSchema).optional(),
    result: z.array(HotelSearchRowSchema).optional(),
    results: z.array(HotelSearchRowSchema).optional(),
    data: z.array(HotelSearchRowSchema).optional(),
  })
  .passthrough();

export const HotelSearchResponseSchema = z
  .object({
    data: z.union([z.array(HotelSearchRowSchema), HotelSearchContainerSchema]).optional(),
    hotels: z.array(HotelSearchRowSchema).optional(),
  })
  .passthrough();
