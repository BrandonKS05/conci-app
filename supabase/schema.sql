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
