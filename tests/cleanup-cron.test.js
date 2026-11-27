import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import pg from 'pg'
import { GET, HEAD } from '../app/api/cron/cleanup/route.js'
import { database } from '../lib/db.js'
import { testDatabase } from './support/database.js'

const secret = 'test-only-cleanup-secret'
const bearer = 'Bearer ' + secret

function request(authorization) {
  return new Request('http://127.0.0.1/api/cron/cleanup', {
    headers: authorization === undefined ? {} : { authorization }
  })
}

function setEnv(t, key, value) {
  const previous = process.env[key]
  t.after(() => {
    if (previous === undefined) delete process.env[key]
    else process.env[key] = previous
  })
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

async function assertResponse(response, code, body) {
  assert.equal(response.status, code)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), body)
}

test('cleanup requires the configured bearer secret and does not fall back to HEAD', async t => {
  setEnv(t, 'CRON_SECRET', secret)
  setEnv(t, 'DATABASE_URL', undefined)
  const log = t.mock.method(console, 'error', () => {})
  for (const candidate of [undefined, secret, 'bearer ' + secret, bearer + ',', 'Bearer x' + secret.slice(1)]) {
    await assertResponse(await GET(request(candidate)), 401, { status: 'unauthorized' })
  }
  process.env.CRON_SECRET = ''
  await assertResponse(await GET(request('Bearer undefined')), 401, { status: 'unauthorized' })
  delete process.env.CRON_SECRET
  await assertResponse(await GET(request(bearer)), 401, { status: 'unauthorized' })
  assert.equal(log.mock.callCount(), 0)

  const head = HEAD()
  assert.equal(head.status, 405)
  assert.equal(head.headers.get('cache-control'), 'no-store')
  assert.equal(await head.text(), '')

  process.env.CRON_SECRET = secret
  await assertResponse(await GET(request(bearer)), 503, { status: 'unavailable' })
  assert.equal(log.mock.callCount(), 1)
})

test('cleanup is bounded, skips locked rows and preserves live and historical records', {
  skip: !process.env.TEST_DATABASE_URL
}, async t => {
  const source = testDatabase()
  const suffix = randomBytes(12).toString('hex')
  const databaseName = 'terrapin_cleanup_' + suffix
  const role = 'terrapin_cleanup_runtime_' + suffix
  const rolePassword = randomBytes(24).toString('hex')
  const ownerUrl = new URL(source)
  ownerUrl.pathname = '/' + databaseName
  const runtimeUrl = new URL(ownerUrl)
  runtimeUrl.username = role
  runtimeUrl.password = rolePassword

  const admin = new pg.Client({ connectionString: source.href })
  const owner = new pg.Client({ connectionString: ownerUrl.href })
  const locker = new pg.Client({ connectionString: ownerUrl.href })
  let connectedOwner = false
  let connectedLocker = false
  await admin.connect()
  try {
    // The route sweeps entire tables. Use a disposable database so other tests cannot be affected.
    await admin.query('create database ' + databaseName)
    await admin.query(`create role ${role} login noinherit password '${rolePassword}'`)
    await owner.connect()
    connectedOwner = true
    const schema = await readFile(new URL('../lib/schema.sql', import.meta.url), 'utf8')
    const grants = await readFile(new URL('../lib/runtime-grants.sql', import.meta.url), 'utf8')
    await owner.query(schema)
    await owner.query(grants.replaceAll('terrapin_runtime', role))
    await owner.query(`
      insert into accounts(name,email,password_hash) values ('Cleanup Fixture','cleanup@example.invalid','fixture');
      insert into sessions(token_hash,account_id,expires_at,absolute_expires_at)
      select 'expired-' || id,1,now()-interval '1 hour',now()+interval '2 hours'
      from generate_series(1,1000) as id;
      insert into sessions(token_hash,account_id,expires_at,absolute_expires_at) values
        ('locked',1,now()-interval '3 hours',now()-interval '2 hours'),
        ('absolute-expired',1,now()+interval '30 minutes',now()-interval '1 hour'),
        ('live',1,now()+interval '30 minutes',now()+interval '2 hours');
      insert into rate_limits(scope,subject,attempts,last_seen)
      select 'login','stale-' || id,array[now()-interval '2 hours'],now()-interval '2 hours'
      from generate_series(1,1001) as id;
      insert into rate_limits(scope,subject,attempts,last_seen) values
        ('login','locked',array[now()-interval '3 hours'],now()-interval '3 hours'),
        ('login','within-retention',array[now()-interval '15 minutes'],now()-interval '15 minutes'),
        ('login','active',array[now()],now());
      insert into events (owner_id,venue_id,title,description,category,host,starts_at,ends_at,deadline,capacity)
      values (1,1,'Cleanup Fixture','Synthetic event','Academic','Fixture',now(),now()+interval '1 hour',now(),10);
      insert into notifications(account_id,event_id,kind,message,created_at,delivered_at)
      values (1,1,'confirmed','Registration history',now()-interval '31 days',now()-interval '31 days');
      insert into audit_entries(action,outcome,created_at) values ('cleanup_fixture','denied',now()-interval '366 days');
    `)
    await locker.connect()
    connectedLocker = true
    await locker.query(`begin;
      select token_hash from sessions where token_hash='locked' for update;
      select subject from rate_limits where scope='login' and subject='locked' for update;`)
    setEnv(t, 'CRON_SECRET', secret)
    setEnv(t, 'DATABASE_URL', runtimeUrl.href)

    await assertResponse(await GET(request(bearer)), 200, {
      status: 'ok', expiredSessions: 1000, staleRateLimits: 1000
    })
    assert.deepEqual((await owner.query('select token_hash from sessions order by token_hash')).rows, [
      { token_hash: 'absolute-expired' }, { token_hash: 'live' }, { token_hash: 'locked' }
    ])
    assert.equal((await owner.query("select 1 from rate_limits where subject='locked'")).rowCount, 1)
    await locker.query('rollback')

    const overlap = await Promise.all([GET(request(bearer)), GET(request(bearer))])
    const counts = await Promise.all(overlap.map(async response => {
      assert.equal(response.status, 200)
      return response.json()
    }))
    assert.equal(counts.reduce((total, count) => total + count.expiredSessions, 0), 2)
    assert.equal(counts.reduce((total, count) => total + count.staleRateLimits, 0), 2)
    await assertResponse(await GET(request(bearer)), 200, {
      status: 'ok', expiredSessions: 0, staleRateLimits: 0
    })
    assert.deepEqual((await owner.query('select token_hash from sessions')).rows, [{ token_hash: 'live' }])
    assert.deepEqual((await owner.query('select subject from rate_limits order by subject')).rows, [
      { subject: 'active' }, { subject: 'within-retention' }
    ])
    assert.equal((await owner.query('select message from notifications')).rows[0].message, 'Registration history')
    assert.equal((await owner.query('select outcome from audit_entries')).rows[0].outcome, 'denied')
  } finally {
    if (connectedLocker) await locker.end()
    if (connectedOwner) await owner.end()
    if (process.env.DATABASE_URL === runtimeUrl.href) await database().end()
    try {
      await admin.query('drop database if exists ' + databaseName)
      await admin.query('drop role if exists ' + role)
    } finally {
      await admin.end()
    }
  }
})
