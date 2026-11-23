begin;

create schema if not exists cems_identity;
revoke all on schema cems_identity from public;

create or replace function cems_identity.resolve_session(requested_hash text)
returns table (id integer, name text, email text, roles text[])
language sql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
    with locked as materialized (
        select s.token_hash, s.expires_at, s.absolute_expires_at
        from public.sessions s
        where s.token_hash = requested_hash and requested_hash ~ '^[0-9a-f]{64}$'
        for no key update
    ),
    checked as materialized (
        select locked.*, clock_timestamp() as checked_at from locked
    )
    update public.sessions s
    set expires_at = least(c.checked_at + interval '30 minutes', c.absolute_expires_at)
    from checked c, public.accounts a
    where s.token_hash = c.token_hash
      and a.id = s.account_id and a.active
      and c.expires_at > c.checked_at and c.absolute_expires_at > c.checked_at
    returning a.id, a.name, a.email, a.roles;
$$;

revoke all on function cems_identity.resolve_session(text) from public;
grant usage on schema cems_identity to terrapin_identity;
grant execute on function cems_identity.resolve_session(text) to terrapin_identity;

commit;
