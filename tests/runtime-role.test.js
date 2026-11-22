import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import pg from 'pg'
import { testDatabase } from './support/database.js'

test('the app role can append audit records but cannot inspect or change them', {
  skip: !process.env.TEST_DATABASE_URL
}, async () => {
  const url = testDatabase()
  const client = new pg.Client({ connectionString: url.href })
  await client.connect()
  try {
    await client.query('begin')
    await client.query('create role terrapin_runtime_spec noinherit')
    const grants = await readFile(new URL('../lib/runtime-grants.sql', import.meta.url), 'utf8')
    await client.query(grants.replaceAll('terrapin_runtime', 'terrapin_runtime_spec'))
    await client.query('set local role terrapin_runtime_spec')

    assert.equal((await client.query('select name from public.venues limit 1')).rowCount, 1)
    assert.equal((await client.query("select public.consume_rate_limit('test','test',1) as allowed")).rows[0].allowed, true)
    assert.equal((await client.query(`insert into public.audit_entries(action,outcome)
      values('runtime_permission_test','success')`)).rowCount, 1)

    for (const statement of [
      'select * from public.audit_entries',
      "update public.audit_entries set outcome='changed'",
      'delete from public.audit_entries',
      'truncate public.audit_entries',
      'create table public.permission_test (id integer)',
      'create schema permission_test'
    ]) {
      await client.query('savepoint permission_check')
      await assert.rejects(client.query(statement), { code: '42501' })
      await client.query('rollback to savepoint permission_check')
      await client.query('release savepoint permission_check')
    }
  } finally {
    try {
      await client.query('rollback')
    } finally {
      await client.end()
    }
  }
})
