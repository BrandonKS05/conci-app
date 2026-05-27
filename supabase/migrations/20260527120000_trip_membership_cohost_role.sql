-- Add co-host to the trip_memberships role constraint.

alter table public.trip_memberships
  drop constraint if exists trip_memberships_role_check;

alter table public.trip_memberships
  add constraint trip_memberships_role_check
  check (role in ('host', 'co-host', 'member'));
