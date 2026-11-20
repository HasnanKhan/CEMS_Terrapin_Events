import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { setTimeout } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import pg from 'pg'
import { tokenHash } from '../lib/password.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const ownerUrl = new URL(process.env.LOAD_TEST_DATABASE_URL ?? 'file:///')
const runtimeUrl = new URL(process.env.LOAD_TEST_RUNTIME_DATABASE_URL ?? ownerUrl)
const users = Number(process.env.LOAD_TEST_USERS ?? 100)
const port = Number(process.env.LOAD_TEST_PORT ?? 3118)
const origin = `http://127.0.0.1:${port}`

assert.ok(['postgres:', 'postgresql:'].includes(ownerUrl.protocol), 'Set LOAD_TEST_DATABASE_URL to a dedicated local PostgreSQL database.')
assert.equal(ownerUrl.hostname, '127.0.0.1', 'The load test only runs against IPv4 loopback PostgreSQL.')
assert.equal(ownerUrl.pathname, '/terrapin_load_test', 'Use the disposable database named terrapin_load_test.')
assert.ok(['postgres:', 'postgresql:'].includes(runtimeUrl.protocol))
assert.ok(runtimeUrl.host === ownerUrl.host && runtimeUrl.pathname === ownerUrl.pathname, 'The runtime login must use the same local test database.')
assert.ok(!ownerUrl.search && !runtimeUrl.search, 'Use plain local PostgreSQL URLs without connection overrides.')
assert.ok(Number.isInteger(users) && users >= 2 && users <= 100, 'Set LOAD_TEST_USERS to an integer from 2 to 100.')
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535, 'Set LOAD_TEST_PORT to an available loopback port.')

const pool = new pg.Pool({ connectionString: ownerUrl.href, max: 2, connectionTimeoutMillis: 5000 })
const batch = randomUUID()
const title = 'Popular event ' + batch
const capacity = Math.min(20, Math.floor(users / 2))
const attendees = Array.from({ length: users }, () => ({ token: randomBytes(32).toString('hex') }))
let app
let browser
let eventId
let fixtureStarted = false

async function seed() {
  await pool.query(await readFile(new URL('../lib/schema.sql', import.meta.url), 'utf8'))
  fixtureStarted = true
  const { rows: [owner] } = await pool.query(`insert into accounts(name,email,password_hash)
    values ('Load fixture organizer',$1,'load fixture') returning id`, [`${batch}-organizer@load.invalid`])
  const { rows: [event] } = await pool.query(`insert into events
    (owner_id,venue_id,title,description,category,host,starts_at,ends_at,deadline,capacity,status)
    select $1,id,$2,'Synthetic registration workload','Academic','Load testing',
      now()+interval '1 day',now()+interval '25 hours',now()+interval '23 hours',$3,'published'
    from venues where name='Iribe Center' returning id`, [owner.id, title, capacity])
  eventId = event.id
  const { rows } = await pool.query(`insert into accounts(name,email,password_hash)
    select 'Load fixture attendee',address,'load fixture' from unnest($1::text[]) as address returning id`,
    [attendees.map((_, i) => `${batch}-${i}@load.invalid`)])
  const ids = rows.map(({ id }) => id)
  attendees.forEach((user, i) => { user.id = ids[i] })
  await pool.query(`insert into sessions(token_hash,account_id,expires_at)
    select token,account,now()+interval '30 minutes' from unnest($1::text[],$2::int[]) as input(token,account)`,
    [attendees.map(({ token }) => tokenHash(token)), ids])
}

async function ensurePortIsFree() {
  const listener = createServer()
  listener.listen(port, '127.0.0.1')
  await once(listener, 'listening')
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()))
}

async function start() {
  await ensurePortIsFree()
  app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DATABASE_URL: runtimeUrl.href,
      DATABASE_URL_UNPOOLED: '',
      VERCEL: '',
      NEXT_TELEMETRY_DISABLED: '1'
    },
    stdio: ['ignore', 'ignore', 'inherit']
  })
  app.once('error', error => console.error('Could not start the local build:', error.message))
  for (let attempt = 0; attempt < 100; attempt++) {
    if (app.exitCode !== null) break
    try {
      const probe = await fetch(origin + '/api/health', { redirect: 'error', signal: AbortSignal.timeout(1000) })
      if (probe.ok && (await probe.json()).status === 'ok') return
    } catch {}
    await setTimeout(100)
  }
  throw new Error('The isolated Next.js app did not start. Run npm run build first and confirm the database and port.')
}

async function page(path, user) {
  assert.ok(path.startsWith('/') && !path.startsWith('//'))
  const response = await fetch(origin + path, {
    headers: user ? { cookie: 'terrapin_session=' + user.token } : {},
    redirect: 'error',
    signal: AbortSignal.timeout(20000)
  })
  assert.equal(response.status, 200, `Unexpected response for ${path}`)
  return response.text()
}

async function extractForms(parser, html, action) {
  return parser.evaluate(({ html, action }) => html.map(source => {
    const document = new DOMParser().parseFromString(source, 'text/html')
    const form = document.querySelector(`form[data-action="${action}"]`) ?? Array.from(document.forms).find(item =>
      Array.from(item.querySelectorAll('button')).some(button => {
        const label = button.textContent.trim()
        return action === 'register' ? /^(Register for event|Join waitlist)$/.test(label) : /^Cancel registration$/.test(label)
      }))
    if (!form || form.getAttribute('method')?.toLowerCase() !== 'post' || form.getAttribute('action') !== '') {
      throw new Error(`Expected a same-page ${action} form in the test fixture.`)
    }
    const fields = Array.from(form.querySelectorAll('input[type=hidden][name]'), input => [input.name, input.value])
    if (!fields.length || fields.some(([name]) => !name.startsWith('$ACTION_'))) {
      throw new Error('The Server Action fields were missing or the form requires extra inputs.')
    }
    return fields
  }), { html, action })
}

async function submitForm(path, user, fields) {
  const body = new FormData()
  for (const [name, value] of fields) body.append(name, value)
  const response = await fetch(origin + path, {
    method: 'POST',
    headers: { cookie: 'terrapin_session=' + user.token, origin },
    redirect: 'manual',
    body,
    signal: AbortSignal.timeout(20000)
  })
  await response.text()
  assert.equal(response.status, 303, 'The registration mutation did not return a result redirect.')
  const location = new URL(response.headers.get('location'), origin)
  assert.equal(location.origin, origin, 'The test only follows a redirect on its loopback server.')
  assert.equal(location.searchParams.get('event'), String(eventId), 'Expected the registration result on the fixture event.')
  const result = await page(location.pathname + location.search, user)
  assert.ok(result.includes(title), 'The fixture registration result did not render.')
}

async function concurrent(items, work) {
  const outcomes = await Promise.allSettled(items.map(async (item, index) => {
    const start = performance.now()
    const result = await work(item, index)
    return { milliseconds: performance.now() - start, result }
  }))
  const failures = outcomes.filter(result => result.status === 'rejected')
  if (failures.length) throw new AggregateError(failures.map(result => result.reason), `${failures.length} of ${items.length} requests failed`)
  return outcomes.map(outcome => outcome.value)
}

function measurement(samples, limit) {
  const ordered = samples.map(sample => sample.milliseconds).sort((a, b) => a - b)
  const deadline = ordered[Math.ceil(ordered.length * .95) - 1]
  return { requests: ordered.length, p95Ms: Math.round(deadline), maxMs: Math.round(ordered.at(-1)), limitMs: limit, passed: deadline <= limit }
}

async function verifyRoster(parser, path) {
  const { rows: initial } = await pool.query(`select account_id,status from registrations where event_id=$1 order by id`, [eventId])
  assert.equal(initial.length, users, 'A registration was lost or duplicated.')
  assert.deepEqual(new Set(initial.map(row => row.account_id)), new Set(attendees.map(user => user.id)), 'Registrations did not match the simulated attendees.')
  assert.deepEqual(initial.map(row => row.status), [
    ...Array(capacity).fill('confirmed'),
    ...Array(users - capacity).fill('waitlisted')
  ], 'A registration exceeded capacity or waitlist ordering was inconsistent.')
  const { rows: notices } = await pool.query(`select account_id,kind from notifications
    where event_id=$1 and kind in ('confirmed','waitlisted')`, [eventId])
  assert.equal(notices.length, users, 'Each registration must persist an inbox entry.')
  const noticeByAccount = new Map(notices.map(row => [row.account_id, row.kind]))
  for (const row of initial) assert.equal(noticeByAccount.get(row.account_id), row.status)

  const promotions = Math.min(3, capacity, users - capacity)
  for (let i = 0; i < promotions; i++) {
    const user = attendees.find(item => item.id === initial[i].account_id)
    const [fields] = await extractForms(parser, [await page(path, user)], 'cancel')
    await submitForm(path, user, fields)
    const { rows: current } = await pool.query(`select account_id,status from registrations where event_id=$1 order by id`, [eventId])
    assert.equal(current.length, users - i - 1)
    assert.equal(current.filter(row => row.status === 'confirmed').length, capacity)
    assert.ok(!current.some(row => row.account_id === user.id))
    const promotedId = initial[capacity + i].account_id
    assert.ok(current.some(row => row.account_id === promotedId && row.status === 'confirmed'), 'The head of the waitlist was not promoted.')
    const { rows: [last] } = await pool.query(`select account_id from notifications
      where event_id=$1 and kind='promoted' order by id desc limit 1`, [eventId])
    assert.equal(last.account_id, promotedId)
  }
  return { confirmed: capacity, waitlisted: users - capacity, duplicateRegistrations: 0, lostRegistrations: 0, fifoPromotions: promotions }
}

async function removeFixtures() {
  const client = await pool.connect()
  try {
    await client.query('begin')
    if (eventId) {
      await client.query('delete from notifications where event_id=$1', [eventId])
      await client.query('delete from registrations where event_id=$1', [eventId])
      await client.query('delete from events where id=$1', [eventId])
    }
    await client.query("delete from rate_limits where scope='registration' and subject=any($1::text[])", [attendees.filter(user => user.id).map(user => tokenHash(String(user.id)))])
    await client.query("delete from accounts where email like $1", [`${batch}-%@load.invalid`])
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

try {
  await seed()
  await start()
  browser = await chromium.launch({ headless: true, executablePath: process.env.LOAD_TEST_CHROMIUM_PATH })
  const parser = await browser.newPage()
  await parser.route('**/*', route => route.abort())
  const path = '/?event=' + eventId
  const search = '/?q=' + encodeURIComponent(title)
  const report = { virtualUsers: users }
  for (const [name, route] of Object.entries({ browse: '/', search, eventDetail: path })) {
    await page(route)
    const samples = await concurrent(attendees, async () => {
      assert.ok((await page(route)).includes(title), 'The fixture event did not render.')
    })
    report[name] = measurement(samples, 3000)
  }
  const forms = await extractForms(parser, (await concurrent(attendees, user => page(path, user))).map(item => item.result), 'register')
  report.registrationOrWaitlist = measurement(await concurrent(attendees, (user, index) =>
    submitForm(path, user, forms[index])), 2000)
  report.integrity = await verifyRoster(parser, path)
  console.log(JSON.stringify(report, null, 2))
  if (Object.values(report).some(result => result?.passed === false)) process.exitCode = 1
} finally {
  try {
    await browser?.close()
  } finally {
    try {
      if (app?.pid && app.exitCode === null && app.signalCode === null) {
        const exited = once(app, 'exit')
        app.kill('SIGTERM')
        await exited
      }
      if (fixtureStarted) await removeFixtures()
    } finally {
      await pool.end()
    }
  }
}
