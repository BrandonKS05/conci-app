-- Public profile page: bio, location, banner, curated lists (JSON)

alter table public.profiles
  add column if not exists bio text,
  add column if not exists location text,
  add column if not exists banner_url text,
  add column if not exists profile_hotels jsonb not null default '[]'::jsonb,
  add column if not exists profile_experiences jsonb not null default '[]'::jsonb,
  add column if not exists profile_restaurants jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public)
values ('profile-banners', 'profile-banners', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Profile banners are publicly readable" on storage.objects;
create policy "Profile banners are publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'profile-banners');

drop policy if exists "Users can upload own profile banner" on storage.objects;
create policy "Users can upload own profile banner"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-banners'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "Users can update own profile banner" on storage.objects;
create policy "Users can update own profile banner"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-banners'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "Users can delete own profile banner" on storage.objects;
create policy "Users can delete own profile banner"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-banners'
    and split_part(name, '/', 1) = auth.uid()::text
  );
