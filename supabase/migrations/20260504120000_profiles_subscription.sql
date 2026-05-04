-- User profile + subscription tier (Stripe). RLS: users read own row; writes via service role / webhooks.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  subscription_tier text not null default 'free'
    constraint profiles_subscription_tier_check
    check (subscription_tier in ('free', 'host', 'host_pro')),
  stripe_customer_id text,
  stripe_subscription_id text,
  updated_at timestamptz not null default now()
);

create index if not exists profiles_stripe_customer_idx on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;
create index if not exists profiles_stripe_subscription_idx on public.profiles (stripe_subscription_id)
  where stripe_subscription_id is not null;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

-- No insert/update/delete for authenticated users — managed by service role (API + Stripe webhooks).
