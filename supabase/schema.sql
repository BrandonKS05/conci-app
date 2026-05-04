create extension if not exists "pgcrypto";

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  category text not null,
  budget text null,
  guest_count integer not null default 1,
  location text null,
  start_date text null,
  end_date text null,
  created_at timestamptz not null default now()
);

create table if not exists public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  item_type text not null,
  title text not null,
  details text not null,
  position integer not null,
  created_at timestamptz not null default now()
);

create index if not exists itinerary_items_request_id_idx on public.itinerary_items (request_id);
create index if not exists itinerary_items_request_order_idx on public.itinerary_items (request_id, position);

create table if not exists public.selections (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  itinerary_item_id uuid null references public.itinerary_items (id) on delete set null,
  status text not null,
  created_at timestamptz not null default now()
);

create index if not exists selections_request_id_idx on public.selections (request_id);
create index if not exists selections_request_created_at_idx on public.selections (request_id, created_at);

-- === Conci shareable trip plans ===
create table if not exists public.trip_plans (
  id uuid primary key default gen_random_uuid(),
  plan jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trip_plans add column if not exists user_id uuid references auth.users (id) on delete set null;
alter table public.trip_plans add column if not exists seed_text text;
alter table public.trip_plans add column if not exists invite_code text;
alter table public.trip_plans add column if not exists collab_state jsonb;
alter table public.trip_plans add column if not exists status text not null default 'draft';
alter table public.trip_plans add column if not exists booking_tasks jsonb not null default '{}'::jsonb;

create unique index if not exists trip_plans_invite_code_uidx on public.trip_plans (invite_code) where invite_code is not null;
create index if not exists trip_plans_created_at_idx on public.trip_plans (created_at desc);
create index if not exists trip_plans_user_id_idx on public.trip_plans (user_id);

alter table public.trip_plans enable row level security;

drop policy if exists "trip_plans_select_public" on public.trip_plans;
drop policy if exists "trip_plans_insert_public" on public.trip_plans;
drop policy if exists "trip_plans_update_public" on public.trip_plans;
drop policy if exists "trip_plans_delete_public" on public.trip_plans;
drop policy if exists "trip_select_own" on public.trip_plans;
drop policy if exists "trip_insert_own" on public.trip_plans;
drop policy if exists "trip_update_own" on public.trip_plans;
drop policy if exists "trip_delete_own" on public.trip_plans;

create policy "trip_select_own"
  on public.trip_plans for select
  to authenticated
  using (auth.uid() = user_id);

create policy "trip_insert_own"
  on public.trip_plans for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "trip_update_own"
  on public.trip_plans for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "trip_delete_own"
  on public.trip_plans for delete
  to authenticated
  using (auth.uid() = user_id);

-- Invite-based membership (host row on trip create; members join via invite code while signed in)
create table if not exists public.trip_memberships (
  id uuid primary key default gen_random_uuid(),
  trip_plan_id uuid not null references public.trip_plans (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  joined_at timestamptz not null default now(),
  constraint trip_memberships_role_check check (role in ('host', 'member')),
  unique (trip_plan_id, user_id)
);

create index if not exists trip_memberships_user_idx on public.trip_memberships (user_id);
create index if not exists trip_memberships_trip_idx on public.trip_memberships (trip_plan_id);

alter table public.trip_memberships enable row level security;

drop policy if exists "trip_memberships_select_own" on public.trip_memberships;
create policy "trip_memberships_select_own"
  on public.trip_memberships for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "trip_select_member" on public.trip_plans;
create policy "trip_select_member"
  on public.trip_plans for select
  to authenticated
  using (
    exists (
      select 1 from public.trip_memberships m
      where m.trip_plan_id = trip_plans.id and m.user_id = auth.uid()
    )
  );

do $$
begin
  alter table public.trip_plans add constraint trip_plans_status_check
    check (status in ('draft', 'voting', 'finalized'));
exception
  when duplicate_object then null;
end $$;

update public.trip_plans set status = 'voting'
  where status = 'draft' and invite_code is not null and length(trim(invite_code)) > 0;

-- Host email reminders (target is an auth user on the roster)
create table if not exists public.trip_plan_nudge_events (
  id uuid primary key default gen_random_uuid(),
  trip_plan_id uuid not null references public.trip_plans (id) on delete cascade,
  target_user_id uuid not null references auth.users (id) on delete cascade,
  channel text not null default 'email',
  created_at timestamptz not null default now(),
  constraint trip_plan_nudge_events_channel_check check (channel = 'email')
);

create index if not exists trip_plan_nudge_events_recent_idx
  on public.trip_plan_nudge_events (trip_plan_id, target_user_id, channel, created_at desc);

alter table public.trip_plan_nudge_events enable row level security;
