begin;

insert into accounts (id, name, email, password_hash) overriding system value values
    (810001, 'Catalog fixture owner', 'catalog-owner@fixture.invalid', 'fixture only'),
    (810002, 'Catalog fixture attendee A', 'catalog-a@fixture.invalid', 'fixture only'),
    (810003, 'Catalog fixture attendee B', 'catalog-b@fixture.invalid', 'fixture only'),
    (810004, 'Catalog fixture attendee C', 'catalog-c@fixture.invalid', 'fixture only');

insert into venues (id, name, capacity) overriding system value values
    (810001, 'Catalog fixture hall', 20),
    (810002, 'Catalog fixture studio', 20);

insert into events (id, owner_id, venue_id, title, description, category, host,
                    starts_at, ends_at, deadline, capacity, status) overriding system value
select 820000 + n, 810001, 810001, 'Spring fair %_ ' || n, 'Catalog fixture: maker workshop',
       'Academic', 'Campus club', now() + interval '2 days', now() + interval '3 days',
       now() + interval '1 day', 2, 'published'
from generate_series(1, 13) n;

insert into events (id, owner_id, venue_id, title, description, category, host,
                    starts_at, ends_at, deadline, capacity, status) overriding system value
select extra.id, 810001, extra.venue, extra.title, 'Catalog fixture: extra event',
       extra.category, 'Campus club', now() + extra.starts, now() + extra.ends,
       now() + extra.starts - interval '1 day', 2, extra.status
from (values
    (820014, 810001, 'Spring fair %_ draft', 'Academic', interval '1 day', interval '2 days', 'draft'),
    (820015, 810001, 'Spring fair %_ pending', 'Academic', interval '1 day', interval '2 days', 'pending'),
    (820016, 810001, 'Spring fair %_ past', 'Academic', interval '-2 days', interval '-1 day', 'published'),
    (820017, 810001, 'Catalog fixture ongoing', 'Academic', interval '-1 day', interval '2 days', 'published'),
    (820018, 810002, 'Spring fair %_ other venue', 'Academic', interval '1 day', interval '2 days', 'published'),
    (820019, 810001, 'Spring fair %_ other category', 'Community', interval '1 day', interval '2 days', 'published'),
    (820020, 810001, 'Spring fair XY', 'Academic', interval '1 day', interval '2 days', 'published')
) as extra(id, venue, title, category, starts, ends, status);

insert into registrations (event_id, account_id, status) values
    (820001, 810002, 'confirmed'),
    (820001, 810003, 'confirmed'),
    (820001, 810004, 'waitlisted');

commit;
