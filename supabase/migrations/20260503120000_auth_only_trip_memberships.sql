-- Auth-only trips: remove guest/SMS tables; add trip_memberships; nudge log keyed by auth user.

drop table if exists public.trip_join_verify_tokens cascade;
drop table if exists public.trip_plan_nudge_events cascade;
drop table if exists public.trip_plan_date_votes cascade;
drop table if exists public.trip_plan_guest_joins cascade;
drop table if exists public.trip_plan_memberships cascade;
drop table if exists public.member_visitor_keys cascade;
drop table if exists public.travel_members cascade;

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

insert into public.trip_memberships (trip_plan_id, user_id, role, joined_at)
select id, user_id, 'host', coalesce(created_at, now())
from public.trip_plans
where user_id is not null
on conflict (trip_plan_id, user_id) do nothing;

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
