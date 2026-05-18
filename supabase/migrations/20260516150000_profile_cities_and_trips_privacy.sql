-- Visited cities list + privacy toggle for recently joined trips on public profile

alter table public.profiles
  add column if not exists profile_cities jsonb not null default '[]'::jsonb,
  add column if not exists recent_trips_public boolean not null default true;
