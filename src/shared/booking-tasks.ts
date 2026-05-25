export type BaseBookingTaskKey = "hotel" | "flights" | "restaurant" | "activity";
export type BookingTaskKey = BaseBookingTaskKey | `hotel:${string}`;

export const BASE_BOOKING_TASK_KEYS: BaseBookingTaskKey[] = ["hotel", "flights", "restaurant", "activity"];

export function bookingStayTaskKey(stayId: string): BookingTaskKey {
  const safe = stayId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return `hotel:${safe || "stay"}`;
}

export function isBookingTaskKey(value: string): value is BookingTaskKey {
  if ((BASE_BOOKING_TASK_KEYS as string[]).includes(value)) return true;
  return /^hotel:[a-z0-9_-]{1,120}$/.test(value);
}

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
  for (const [k, v] of Object.entries(o)) {
    if (!isBookingTaskKey(k)) continue;
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
