import { randomBytes, randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import pg from 'pg'
import { tokenHash } from '../../lib/password.js'
import { testDatabase } from '../support/database.js'

const attendeeRoles = ['attendee']
const organizerRoles = ['attendee', 'organizer']

async function withFixtures(run) {
  const db = new pg.Pool({ connectionString: testDatabase().href })
  const marker = randomUUID()
  const accounts = []
  const events = []
  async function createAccounts(roles) {
    const seeds = roles.map((assignedRoles, index) => ({
      name: 'API fixture ' + index,
      email: `api-${accounts.length + index}-${marker}@umd.edu`,
      roles: assignedRoles
    }))
    const { rows } = await db.query(`insert into accounts(name,email,password_hash,roles)
      select name,email,'fixture',roles
      from jsonb_to_recordset($1::jsonb) as fixture(name text,email text,roles text[])
      returning id,name,email`, [JSON.stringify(seeds)])
    const byEmail = new Map(rows.map(account => [account.email, account]))
    const actors = seeds.map(({ email }) => ({ ...byEmail.get(email), token: randomBytes(32).toString('hex') }))
    accounts.push(...actors)
    await db.query(`insert into sessions(token_hash,account_id,expires_at)
      select token,id,now()+interval '30 minutes' from unnest($1::text[],$2::int[]) as fixture(token,id)`,
    [actors.map(actor => tokenHash(actor.token)), actors.map(actor => actor.id)])
    return actors
  }

  async function createEvent(owner, { capacity = 1, status = 'published', closed = false } = {}) {
    const { rows: [event] } = await db.query(`insert into events
      (owner_id,venue_id,title,description,category,host,starts_at,ends_at,deadline,capacity,status)
      select $1,id,$2,'API test fixture','Academic','Test organizer',now()+interval '2 days',
        now()+interval '49 hours',now()+case when $3 then interval '-1 hour' else interval '47 hours' end,$4,$5
      from venues where name='Iribe Center' returning id,title`,
    [owner.id, `API fixture ${events.length} ${marker}`, closed, capacity, status])
    events.push(event.id)
    return event
  }

  try {
    await run({ db, createAccounts, createEvent })
  } finally {
    try {
      const ids = accounts.map(account => account.id)
      await db.query('delete from notifications where event_id=any($1)', [events])
      await db.query('delete from registrations where event_id=any($1)', [events])
      await db.query(`delete from audit_entries where actor_id=any($1)
        or (action in ('registration_create','roster_view') and target=any($2))`, [ids, events.map(String)])
      await db.query("delete from rate_limits where scope='registration' and subject=any($1)", [ids.map(id => tokenHash(String(id)))])
      await db.query('delete from events where id=any($1)', [events])
      await db.query('delete from accounts where id=any($1)', [ids])
    } finally {
      await db.end()
    }
  }
}

const eventPath = (id, action) => `/api/events/${id}/${action}`
const session = actor => actor ? { Cookie: `terrapin_session=${actor.token}` } : {}
const register = (request, baseURL, id, actor) => request.post(eventPath(id, 'registrations'), {
  headers: { ...session(actor), Origin: new URL(baseURL).origin }
})

async function expectError(response, status, code) {
  expect(response.status()).toBe(status)
  expect(response.headers()['cache-control']).toBe('no-store')
  const error = await response.json()
  expect(Object.keys(error).sort()).toEqual(['code', 'fieldErrors', 'message', 'path', 'status', 'timestamp'])
  expect(error).toMatchObject({ status, code, path: new URL(response.url()).pathname, fieldErrors: {} })
  expect(error.message).toEqual(expect.any(String))
  expect(new Date(error.timestamp).toISOString()).toBe(error.timestamp)
  return error
}

test('P-1 gives exactly one remaining seat to fifty concurrent REST registrations', async ({ request, baseURL }) => {
  await withFixtures(async ({ db, createAccounts, createEvent }) => {
    const [owner, seated, ...applicants] = await createAccounts([organizerRoles, ...Array(51).fill(attendeeRoles)])
    const event = await createEvent(owner, { capacity: 2 })
    await db.query("insert into registrations(event_id,account_id,status) values($1,$2,'confirmed')", [event.id, seated.id])

    const responses = await Promise.all(applicants.map(actor => register(request, baseURL, event.id, actor)))
    const results = await Promise.all(responses.map(async response => {
      expect(response.status()).toBe(201)
      expect(response.headers()['cache-control']).toBe('no-store')
      return response.json()
    }))
    expect(results.filter(result => result.status === 'confirmed')).toHaveLength(1)
    expect(results.filter(result => result.status === 'waitlisted')).toHaveLength(49)
    expect(new Set(results.map(result => result.id)).size).toBe(50)

    const { rows: persisted } = await db.query('select id,account_id,status from registrations where event_id=$1 order by id', [event.id])
    expect(persisted.map(row => row.account_id).sort((a, b) => a - b))
      .toEqual([seated.id, ...applicants.map(actor => actor.id)].sort((a, b) => a - b))
    const winner = persisted.find(row => row.status === 'confirmed' && row.account_id !== seated.id)
    expect(results.find(result => result.status === 'confirmed')).toEqual({ id: winner?.id, status: 'confirmed' })
    const byId = new Map(results.map(result => [result.id, result]))
    for (const [index, row] of persisted.filter(row => row.status === 'waitlisted').entries()) {
      expect(byId.get(row.id)).toEqual({ id: row.id, status: 'waitlisted', position: index + 1 })
    }
    expect(persisted.filter(row => row.status === 'confirmed')).toHaveLength(2)
    const { rows: notices } = await db.query('select account_id from notifications where event_id=$1 order by account_id', [event.id])
    expect(notices.map(notice => notice.account_id)).toEqual(applicants.map(actor => actor.id).sort((a, b) => a - b))
  })
})

test('P-3 denies and audits unauthorized roster access without disclosing personal data', async ({ request }) => {
  await withFixtures(async ({ db, createAccounts, createEvent }) => {
    const [owner, attendee, otherOrganizer, administrator, systemAdministrator] = await createAccounts([
      organizerRoles, attendeeRoles, organizerRoles, ['attendee', 'administrator'], ['attendee', 'system_admin']
    ])
    const event = await createEvent(owner)
    const url = eventPath(event.id, 'roster')
    await db.query("insert into registrations(event_id,account_id,status) values($1,$2,'confirmed')", [event.id, attendee.id])
    const before = (await db.query('select * from registrations where event_id=$1', [event.id])).rows

    for (const actor of [null, attendee, otherOrganizer, systemAdministrator]) {
      const response = await request.get(url, { headers: session(actor) })
      const error = await expectError(response, actor ? 403 : 401, actor ? 'ACCESS_DENIED' : 'AUTHENTICATION_REQUIRED')
      const body = JSON.stringify(error)
      expect(body).not.toContain(attendee.email)
      expect(body).not.toContain(attendee.name)
      expect(body).not.toContain(event.title)
    }
    for (const actor of [owner, administrator]) {
      const response = await request.get(url, { headers: session(actor) })
      expect(response.status()).toBe(200)
      expect(response.headers()['cache-control']).toBe('no-store')
      const { event: returned, rows } = await response.json()
      expect(returned).toMatchObject({ id: event.id, title: event.title, status: 'published' })
      expect(rows).toEqual([{
        name: attendee.name, email: attendee.email, status: 'confirmed', created_at: expect.any(String)
      }])
    }

    const { rows: denials } = await db.query(`select actor_id,outcome from audit_entries
      where action='roster_view' and target=$1 order by id`, [String(event.id)])
    expect(denials).toEqual([null, attendee.id, otherOrganizer.id, systemAdministrator.id]
      .map(actor_id => ({ actor_id, outcome: 'denied' })))
    expect((await db.query('select * from registrations where event_id=$1', [event.id])).rows).toEqual(before)
  })
})

test('registration exposes safe API errors and requires a same-origin authenticated request', async ({ request, baseURL }) => {
  await withFixtures(async ({ db, createAccounts, createEvent }) => {
    const [owner, attendee, rateLimited] = await createAccounts([organizerRoles, attendeeRoles, attendeeRoles])
    const event = await createEvent(owner)
    const closed = await createEvent(owner, { closed: true })
    const draft = await createEvent(owner, { status: 'draft' })

    await expectError(await register(request, baseURL, '1e3', attendee), 400, 'VALIDATION_FAILED')
    await expectError(await register(request, baseURL, '2147483648', attendee), 400, 'VALIDATION_FAILED')
    await expectError(await register(request, baseURL, event.id, null), 401, 'AUTHENTICATION_REQUIRED')
    for (const extra of [{}, { Origin: 'https://example.invalid' }]) {
      const response = await request.post(eventPath(event.id, 'registrations'), { headers: { ...session(attendee), ...extra } })
      await expectError(response, 403, 'ACCESS_DENIED')
      expect(response.headers()['access-control-allow-origin']).toBeUndefined()
    }
    expect((await db.query('select id from registrations where event_id=$1', [event.id])).rowCount).toBe(0)
    const { rows: denials } = await db.query(`select actor_id,outcome from audit_entries
      where action='registration_create' and target=$1 order by id`, [String(event.id)])
    expect(denials).toEqual(Array.from({ length: 3 }, () => ({ actor_id: null, outcome: 'denied' })))

    await expectError(await register(request, baseURL, 2147483647, attendee), 404, 'NOT_FOUND')
    await expectError(await register(request, baseURL, closed.id, attendee), 422, 'REGISTRATION_CLOSED')
    await expectError(await register(request, baseURL, draft.id, attendee), 422, 'REGISTRATION_CLOSED')

    await db.query(`insert into rate_limits(scope,subject,attempts,last_seen)
      values('registration',$1,array_fill(now(),array[10]),now())`, [tokenHash(String(rateLimited.id))])
    await expectError(await register(request, baseURL, event.id, rateLimited), 429, 'RATE_LIMIT_EXCEEDED')

    const barrier = await db.connect()
    try {
      await barrier.query('begin')
      await barrier.query('select id from events where id=$1 for update', [event.id])
      const started = performance.now()
      const error = await expectError(await register(request, baseURL, event.id, attendee), 503, 'SERVICE_UNAVAILABLE')
      expect(error.message).toBe('Could not be confirmed, please try again.')
      expect(performance.now() - started).toBeLessThan(5000)
    } finally {
      try {
        await barrier.query('rollback')
      } finally {
        barrier.release()
      }
    }
    expect((await db.query('select id from registrations where event_id=$1', [event.id])).rowCount).toBe(0)

    const response = await register(request, baseURL, event.id, attendee)
    expect(response.status()).toBe(201)
    expect(await response.json()).toEqual({ id: expect.any(Number), status: 'confirmed' })
    await expectError(await register(request, baseURL, event.id, attendee), 409, 'DUPLICATE_REGISTRATION')
    expect((await db.query('select id from registrations where event_id=$1', [event.id])).rowCount).toBe(1)
  })
})
