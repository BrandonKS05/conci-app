-- Add calendar_busy_dates JSONB to trip_memberships so members can store
-- their busy date ranges from Apple Calendar (.ics upload) or Google Calendar.
-- Shape: Array of { start: "YYYY-MM-DD", end: "YYYY-MM-DD", source: "apple" | "google" | "manual" }
-- Note: stored per-trip (trip_memberships row) not globally per-user.

alter table public.trip_memberships
  add column if not exists calendar_busy_dates jsonb not null default '[]'::jsonb;

create index if not exists trip_memberships_calendar_busy_dates_idx
  on public.trip_memberships using gin (calendar_busy_dates)
  where calendar_busy_dates != '[]'::jsonb;
