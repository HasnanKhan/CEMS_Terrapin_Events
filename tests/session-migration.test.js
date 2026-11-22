import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import pg from 'pg'
import { testDatabase } from './support/database.js'

test('session schema preserves old deadlines and supports the previous app during rollout', {
  skip: !process.env.TEST_DATABASE_URL
}, async () => {
  const url = testDatabase()
  const client = new pg.Client({ connectionString: url.href })
  await client.connect()
  try {
    await client.query('begin')
    await client.query('create schema terrapin_session_migration_spec')
    await client.query('set local search_path to terrapin_session_migration_spec')
    await client.query(`create table sessions(token_hash text primary key,account_id integer not null,expires_at timestamptz not null);
      insert into sessions values('prior-session',1,now()+interval '20 minutes')`)
    const schema = await readFile(new URL('../lib/schema.sql', import.meta.url), 'utf8')
    await client.query(schema)
    await client.query(schema)
    const { rows: [prior] } = await client.query("select expires_at=absolute_expires_at as kept from sessions where token_hash='prior-session'")
    assert.equal(prior.kept, true)

    await client.query("insert into sessions values('previous-deployment',1,now()+interval '30 minutes')")
    const { rows: [fresh] } = await client.query(`select absolute_expires_at=now()+interval '12 hours' as has_default
      from sessions where token_hash='previous-deployment'`)
    assert.equal(fresh.has_default, true)
  } finally {
    try {
      await client.query('rollback')
    } finally {
      await client.end()
    }
  }
})
