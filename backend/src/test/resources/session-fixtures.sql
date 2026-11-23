begin;

insert into accounts (id, name, email, password_hash, active) overriding system value values
    (810005, 'Inactive fixture account', 'inactive@fixture.invalid', 'fixture only', false);

insert into sessions (token_hash, account_id, expires_at, absolute_expires_at) values
    (repeat('aa', 32), 810002, now() + interval '10 minutes', now() + interval '12 hours'),
    (repeat('bb', 32), 810003, now() + interval '5 minutes', now() + interval '10 minutes'),
    (repeat('cc', 32), 810004, now() - interval '1 minute', now() + interval '12 hours'),
    (repeat('dd', 32), 810004, now() + interval '5 minutes', now() - interval '1 minute'),
    (repeat('ee', 32), 810005, now() + interval '5 minutes', now() + interval '12 hours');

commit;
