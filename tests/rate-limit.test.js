import { strict as assert } from 'node:assert'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { database, query } from '../lib/db.js'
import { clientIp } from '../lib/rate-limit.js'
import { testDatabase } from './support/database.js'

test('NFR-18 uses only a valid, Vercel-supplied client IP', () => {
  const requestHeaders = new Headers({ 'x-forwarded-for': '203.0.113.42' })
  assert.equal(clientIp(requestHeaders, true), '203.0.113.42')
  assert.equal(clientIp(requestHeaders, false), null)
  requestHeaders.set('x-forwarded-for', '203.0.113.42, 203.0.113.5')
  assert.equal(clientIp(requestHeaders, true), null)
})

test('NFR-18 enforces rolling limits across concurrent requests', {
  skip: !process.env.TEST_DATABASE_URL
}, async t => {
  const url = testDatabase()
  process.env.DATABASE_URL = url.href
  const subject = randomUUID()
  t.after(async () => {
    try {
      await query('delete from rate_limits where subject=$1', [subject])
    } finally {
      await database().end()
    }
  })

  async function consume(scope, limit) {
    const { rows: [{ allowed }] } = await query(
      'select consume_rate_limit($1,$2,$3) as allowed', [scope, subject, limit]
    )
    return allowed
  }

  const registrations = await Promise.all(Array.from({ length: 13 }, () => consume('registration', 10)))
  assert.equal(registrations.filter(Boolean).length, 10)
  const logins = await Promise.all(Array.from({ length: 23 }, () => consume('login', 20)))
  assert.equal(logins.filter(Boolean).length, 20)
  assert.equal(await consume('registration', 10), false)

  await query(`update rate_limits
    set attempts=array_prepend(now() - interval '61 seconds', attempts[2:10])
    where scope='registration' and subject=$1`, [subject])
  assert.equal(await consume('registration', 10), true)
  assert.equal(await consume('registration', 10), false)
})
