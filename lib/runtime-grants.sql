grant usage on schema public to terrapin_runtime;
grant select on public.accounts, public.sessions, public.venues, public.events,
  public.registrations, public.notifications, public.rate_limits to terrapin_runtime;

grant insert (name,email,password_hash), update (roles,active,failed,locked_until,password_hash)
  on public.accounts to terrapin_runtime;
grant insert (token_hash,account_id,expires_at), update (expires_at), delete
  on public.sessions to terrapin_runtime;
grant insert (owner_id,venue_id,title,description,category,host,starts_at,ends_at,deadline,capacity),
  update (venue_id,title,description,category,host,starts_at,ends_at,deadline,capacity,status,submitted_at)
  on public.events to terrapin_runtime;
grant insert (event_id,account_id,status), update (status), delete
  on public.registrations to terrapin_runtime;
grant insert (account_id,event_id,kind,message) on public.notifications to terrapin_runtime;
grant insert, update, delete on public.rate_limits to terrapin_runtime;
grant execute on function public.consume_rate_limit(text,text,integer) to terrapin_runtime;

grant insert (actor_id,action,target,outcome,source_ip) on public.audit_entries to terrapin_runtime;
