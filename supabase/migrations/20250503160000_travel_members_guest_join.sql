-- Idempotent: run in Supabase → SQL Editor if join flow errors with
-- "Could not find the table 'public.travel_members' in the schema cache".
-- Requires public.trip_plans (and auth.users) to already exist.

create extension if not exists "pgcrypto";

-- Anonymous guests (API uses service role; RLS on for defense in depth)
create table if not exists public.travel_members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users (id) on delete set null,
  display_name text not null,
  email_norm text,
  phone_digits text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint travel_members_contact_chk check (
    (email_norm is not null and length(trim(email_norm)) > 0)
    or (phone_digits is not null and length(trim(phone_digits)) >= 10)
  )
);

create unique index if not exists travel_members_email_norm_uidx
  on public.travel_members (email_norm)
  where email_norm is not null;

create unique index if not exists travel_members_phone_digits_uidx
  on public.travel_members (phone_digits)
  where phone_digits is not null;

create unique index if not exists travel_members_auth_user_uidx
  on public.travel_members (auth_user_id)
  where auth_user_id is not null;

create table if not exists public.member_visitor_keys (
  visitor_key uuid primary key,
  member_id uuid not null references public.travel_members (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists member_visitor_keys_member_idx on public.member_visitor_keys (member_id);

create table if not exists public.trip_plan_memberships (
  trip_plan_id uuid not null references public.trip_plans (id) on delete cascade,
  member_id uuid not null references public.travel_members (id) on delete cascade,
  joined_via text not null default 'invite_code',
  created_at timestamptz not null default now(),
  primary key (trip_plan_id, member_id)
);

create index if not exists trip_plan_memberships_member_idx on public.trip_plan_memberships (member_id);

alter table public.travel_members enable row level security;
alter table public.member_visitor_keys enable row level security;
alter table public.trip_plan_memberships enable row level security;

create table if not exists public.trip_plan_guest_joins (
  id uuid primary key default gen_random_uuid(),
  trip_plan_id uuid not null references public.trip_plans (id) on delete cascade,
  visitor_key text not null,
  display_name text not null,
  phone text,
  email text,
  member_id uuid references public.travel_members (id) on delete set null,
  rsvp_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_plan_id, visitor_key)
);

alter table public.trip_plan_guest_joins drop constraint if exists trip_plan_guest_joins_rsvp_check;
alter table public.trip_plan_guest_joins add constraint trip_plan_guest_joins_rsvp_check
  check (rsvp_status is null or rsvp_status in ('in', 'out'));

create index if not exists trip_plan_guest_joins_trip_idx on public.trip_plan_guest_joins (trip_plan_id);

create table if not exists public.trip_plan_date_votes (
  id uuid primary key default gen_random_uuid(),
  trip_plan_id uuid not null references public.trip_plans (id) on delete cascade,
  visitor_key text not null,
  date_option text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_plan_id, visitor_key)
);

create index if not exists trip_plan_date_votes_trip_idx on public.trip_plan_date_votes (trip_plan_id);

alter table public.trip_plan_guest_joins enable row level security;
alter table public.trip_plan_date_votes enable row level security;

alter table public.trip_plan_guest_joins add column if not exists rsvp_status text;
alter table public.trip_plan_guest_joins add column if not exists email text;
alter table public.trip_plan_guest_joins add column if not exists member_id uuid references public.travel_members (id) on delete set null;

-- SMS verify + returning guest session
alter table public.travel_members add column if not exists guest_session_token text;

create unique index if not exists travel_members_guest_session_token_uidx
  on public.travel_members (guest_session_token)
  where guest_session_token is not null and length(trim(guest_session_token)) > 0;

create table if not exists public.trip_join_verify_tokens (
  token text primary key,
  trip_plan_id uuid not null references public.trip_plans (id) on delete cascade,
  member_id uuid not null references public.travel_members (id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists trip_join_verify_tokens_trip_idx on public.trip_join_verify_tokens (trip_plan_id);

alter table public.trip_join_verify_tokens enable row level security;

-- Nudges (optional; safe if already present)
create table if not exists public.trip_plan_nudge_events (
  id uuid primary key default gen_random_uuid(),
  trip_plan_id uuid not null references public.trip_plans (id) on delete cascade,
  member_id uuid references public.travel_members (id) on delete set null,
  guest_visitor_key text,
  channel text not null,
  created_at timestamptz not null default now(),
  constraint trip_plan_nudge_events_channel_check check (channel in ('email', 'sms')),
  constraint trip_plan_nudge_events_target_check check (
    (member_id is not null and guest_visitor_key is null)
    or (member_id is null and guest_visitor_key is not null)
  )
);

create index if not exists trip_plan_nudge_events_member_recent_idx
  on public.trip_plan_nudge_events (trip_plan_id, member_id, channel, created_at desc);

create index if not exists trip_plan_nudge_events_guest_recent_idx
  on public.trip_plan_nudge_events (trip_plan_id, guest_visitor_key, channel, created_at desc);

alter table public.trip_plan_nudge_events enable row level security;
