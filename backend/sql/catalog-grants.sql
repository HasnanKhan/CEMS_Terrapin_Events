begin;

create schema if not exists cems_catalog;
revoke all on schema cems_catalog from public;

create or replace view cems_catalog.published_events with (security_barrier = true) as
select e.id, e.venue_id, e.title, e.description, e.category, e.host, v.name as venue,
       e.starts_at, e.ends_at, e.deadline, e.capacity,
       (select count(*)::integer from public.registrations r
        where r.event_id = e.id and r.status = 'confirmed') as confirmed,
       (select count(*)::integer from public.registrations r
        where r.event_id = e.id and r.status = 'waitlisted') as waitlisted
from public.events e
join public.venues v on v.id = e.venue_id
where e.status = 'published';

create or replace view cems_catalog.venues as
select id, name from public.venues;

-- Revoke the original catalog role's direct column grants on existing databases.
revoke select (id, venue_id, title, description, category, host, starts_at, ends_at, deadline, capacity, status)
  on public.events from terrapin_catalog;
revoke select (id, name) on public.venues from terrapin_catalog;
revoke select (event_id, status) on public.registrations from terrapin_catalog;
revoke usage on schema public from terrapin_catalog;

revoke all on cems_catalog.published_events, cems_catalog.venues from public;
grant usage on schema cems_catalog to terrapin_catalog;
grant select on cems_catalog.published_events, cems_catalog.venues to terrapin_catalog;

commit;
