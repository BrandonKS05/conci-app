-- Trip deposits: records every successful Stripe payment linked to a trip
create table if not exists public.trip_deposits (
  id uuid primary key default gen_random_uuid(),
  trip_plan_id uuid not null references public.trip_plans (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  status text not null default 'pending',
  contributor_name text,
  created_at timestamptz not null default now(),
  constraint trip_deposits_status_check check (status in ('pending', 'succeeded', 'failed'))
);

create index if not exists trip_deposits_trip_idx on public.trip_deposits (trip_plan_id);
create index if not exists trip_deposits_user_idx on public.trip_deposits (user_id);
create index if not exists trip_deposits_session_idx on public.trip_deposits (stripe_checkout_session_id);

alter table public.trip_deposits enable row level security;

-- Members of a trip can see all deposits for that trip
create policy "trip_deposits_select_member"
  on public.trip_deposits for select
  to authenticated
  using (
    exists (
      select 1 from public.trip_memberships m
      where m.trip_plan_id = trip_deposits.trip_plan_id and m.user_id = auth.uid()
    )
  );

-- Trip owner can also see deposits
create policy "trip_deposits_select_owner"
  on public.trip_deposits for select
  to authenticated
  using (
    exists (
      select 1 from public.trip_plans tp
      where tp.id = trip_deposits.trip_plan_id and tp.user_id = auth.uid()
    )
  );
