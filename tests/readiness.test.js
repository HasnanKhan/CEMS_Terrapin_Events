import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GET } from '../app/api/health/route.js'

test('readiness returns an uncached 503 without exposing database errors', async t => {
  const url = process.env.DATABASE_URL
  t.after(() => {
    if (url === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = url
  })
  delete process.env.DATABASE_URL
  t.mock.method(console, 'error', () => {})
  const response = await GET()
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { status: 'unavailable' })
})
