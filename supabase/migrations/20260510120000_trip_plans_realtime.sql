-- Full row payloads on UPDATE so realtime clients receive `plan`, `collab_state`, etc.
alter table public.trip_plans replica identity full;

-- Broadcast trip_plans row updates to subscribed clients (RLS still applies per subscriber).
do $$
begin
  alter publication supabase_realtime add table public.trip_plans;
exception
  when duplicate_object then
    null;
end $$;
