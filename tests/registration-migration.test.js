import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import pg from 'pg'
import { testDatabase } from './support/database.js'

test('registration migration preserves legacy rows and limits uniqueness to active registrations', {
  skip: !process.env.TEST_DATABASE_URL
}, async () => {
  const db = new pg.Client({ connectionString: testDatabase().href })
  const schema = await readFile(new URL('../lib/schema.sql', import.meta.url), 'utf8')
  await db.connect()
  try {
    await db.query('begin')
    await db.query('create schema terrapin_registration_migration_spec')
    await db.query('set local search_path to terrapin_registration_migration_spec')
    await db.query(schema)
    await db.query(`alter table registrations drop constraint registrations_cancellation_state_check, drop column cancelled_at;
      drop index registrations_active_account_event;
      alter table registrations add check (status in ('confirmed','waitlisted')), add unique (event_id, account_id);
      insert into accounts(name,email,password_hash) values ('Fixture','migration@umd.edu','fixture');
      insert into events(owner_id,venue_id,title,description,category,host,starts_at,ends_at,deadline,capacity)
        select a.id,v.id,'Fixture','Fixture','Academic','Fixture',now()+interval '2 days',now()+interval '3 days',now()+interval '1 day',1
        from accounts a cross join venues v where v.name='Iribe Center';
      insert into registrations(event_id,account_id,status) values (1,1,'confirmed')`)
    const { rows: [before] } = await db.query('select id,status,created_at from registrations')
    await db.query(schema)
    await db.query(schema)
    const { rows: [after] } = await db.query('select id,status,created_at,cancelled_at from registrations')
    assert.deepEqual(after, { ...before, cancelled_at: null })

    await db.query("update registrations set status='cancelled',cancelled_at=clock_timestamp() where id=$1", [before.id])
    const { rows: [reregistered] } = await db.query(`insert into registrations(event_id,account_id,status) values (1,1,'waitlisted')
      on conflict (event_id,account_id) where status in ('confirmed','waitlisted') do nothing returning id`)
    assert.ok(reregistered.id > before.id)
    await assert.rejects(db.query("insert into registrations(event_id,account_id,status) values (1,1,'confirmed')"), { code: '23505' })
  } finally {
    try { await db.query('rollback') } finally { await db.end() }
  }
})
