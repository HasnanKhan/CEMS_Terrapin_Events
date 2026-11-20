create table if not exists accounts (
  id integer generated always as identity primary key,
  name text not null,
  email text unique not null,
  password_hash text not null,
  roles text[] not null default array['attendee'],
  active boolean not null default true,
  failed integer not null default 0,
  locked_until timestamptz
);
create table if not exists sessions (
  token_hash text primary key,
  account_id integer not null references accounts(id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists sessions_expiry on sessions(expires_at);
create table if not exists venues (
  id integer generated always as identity primary key,
  name text unique not null,
  capacity integer not null check (capacity > 0)
);
create table if not exists events (
  id integer generated always as identity primary key,
  owner_id integer not null references accounts(id),
  venue_id integer not null references venues(id),
  title text not null,
  description text not null,
  category text not null,
  host text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  deadline timestamptz not null,
  capacity integer not null check (capacity > 0),
  status text not null default 'draft' check (status in ('draft', 'pending', 'published')),
  submitted_at timestamptz,
  check (ends_at > starts_at and deadline <= starts_at)
);
create table if not exists registrations (
  id integer generated always as identity primary key,
  event_id integer not null references events(id),
  account_id integer not null references accounts(id),
  status text not null check (status in ('confirmed', 'waitlisted')),
  created_at timestamptz not null default clock_timestamp(),
  unique (event_id, account_id)
);
create index if not exists registrations_queue on registrations(event_id, status, id);
create table if not exists notifications (
  id integer generated always as identity primary key,
  account_id integer not null references accounts(id),
  event_id integer not null references events(id),
  kind text not null,
  message text not null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz not null default now()
);
create table if not exists audit_entries (
  id integer generated always as identity primary key,
  actor_id integer references accounts(id),
  action text not null,
  target text,
  outcome text not null,
  source_ip text,
  created_at timestamptz not null default now()
);
insert into venues (name, capacity) values
  ('Stamp Student Union', 120), ('Hornbake Library', 45),
  ('Iribe Center', 90), ('McKeldin Library', 36)
on conflict (name) do nothing;
