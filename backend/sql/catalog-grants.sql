grant usage on schema public to terrapin_catalog;
grant select (id, venue_id, title, description, category, host, starts_at, ends_at, deadline, capacity, status)
  on public.events to terrapin_catalog;
grant select (id, name) on public.venues to terrapin_catalog;
grant select (event_id, status) on public.registrations to terrapin_catalog;
