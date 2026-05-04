export type BookingTaskKey = "hotel" | "flights" | "restaurant";

export type BookingTaskEntry = {
  booked: boolean;
  bookedBy?: string;
  bookedAt?: string;
};

export type BookingTasksState = Partial<Record<BookingTaskKey, BookingTaskEntry>>;

export function parseBookingTasks(raw: unknown): BookingTasksState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: BookingTasksState = {};
  for (const k of ["hotel", "flights", "restaurant"] as const) {
    const v = o[k];
    if (!v || typeof v !== "object") continue;
    const e = v as Record<string, unknown>;
    out[k] = {
      booked: e.booked === true,
      bookedBy: typeof e.bookedBy === "string" ? e.bookedBy : undefined,
      bookedAt: typeof e.bookedAt === "string" ? e.bookedAt : undefined,
    };
  }
  return out;
}
