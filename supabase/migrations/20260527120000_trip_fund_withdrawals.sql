-- Trip fund withdrawals: records when a host marks the collected fund as withdrawn.
-- This is a manual flow — the host withdraws via the Stripe dashboard and marks it here.
create table if not exists public.trip_fund_withdrawals (
  id uuid primary key default gen_random_uuid(),
  trip_plan_id uuid not null references public.trip_plans (id) on delete cascade,
  host_user_id uuid not null references auth.users (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists trip_fund_withdrawals_trip_idx on public.trip_fund_withdrawals (trip_plan_id);

alter table public.trip_fund_withdrawals enable row level security;

-- Only the trip host can see/insert withdrawals
create policy "trip_fund_withdrawals_select_host"
  on public.trip_fund_withdrawals for select
  to authenticated
  using (
    exists (
      select 1 from public.trip_memberships m
      where m.trip_plan_id = trip_fund_withdrawals.trip_plan_id
        and m.user_id = auth.uid()
        and m.role = 'host'
    )
  );

create policy "trip_fund_withdrawals_insert_host"
  on public.trip_fund_withdrawals for insert
  to authenticated
  with check (
    host_user_id = auth.uid()
    and exists (
      select 1 from public.trip_memberships m
      where m.trip_plan_id = trip_fund_withdrawals.trip_plan_id
        and m.user_id = auth.uid()
        and m.role = 'host'
    )
  );
