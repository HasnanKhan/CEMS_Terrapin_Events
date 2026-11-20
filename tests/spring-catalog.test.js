import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { springDirectory, SpringCatalogUnavailable } from '../lib/spring-catalog.js'

const location = { id: 42, name: 'Spring venue' }
const event = {
  id: 7, title: 'Spring event', category: 'Academic', venue: location.name,
  startsAt: '2030-01-01T15:00:00Z', registrationDeadline: '2029-12-31T15:00:00Z',
  capacity: 12, confirmed: 4
}
const filters = { keyword: '', category: '', venue: null, page: 1 }

function json(response, body) {
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

async function serverFor(t, handler) {
  const server = createServer(handler)
  const { port } = await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server.address()))
  })
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
    server.closeAllConnections()
  }))
  return 'http://127.0.0.1:' + port
}

test('proxies only the public catalog requests and preserves encoded filters', async t => {
  const requests = []
  const origin = await serverFor(t, (request, response) => {
    requests.push(request)
    if (request.url === '/api/venues') return json(response, [{ ...location, capacity: 99 }])
    json(response, { events: [{ ...event, ownerId: 95 }], page: 2, hasNext: false })
  })
  const search = { keyword: 'Art & design + literal %_', category: 'Academic', venue: 42, page: 2 }
  const directory = await springDirectory(origin, search)
  assert.deepEqual(directory, {
    locations: [location], filters: search, hasNext: false,
    rows: [{
      id: 7, title: event.title, category: event.category, venue: location.name, capacity: 12, confirmed: 4,
      starts_at: new Date(event.startsAt), deadline: new Date(event.registrationDeadline)
    }]
  })
  assert.deepEqual(requests.map(request => request.method), ['GET', 'GET'])
  assert.equal(requests[0].url, '/api/venues')
  assert.deepEqual(Object.fromEntries(new URL(requests[1].url, origin).searchParams), {
    q: search.keyword, category: search.category, venue: '42', page: '2'
  })
  for (const { headers } of requests) {
    assert.equal(headers.accept, 'application/json')
    assert.equal(headers.authorization, undefined)
    assert.equal(headers.cookie, undefined)
  }
})

test('normalizes an unknown venue and preserves a full page with more results', async t => {
  const path = []
  const origin = await serverFor(t, (request, response) => {
    path.push(request.url)
    if (request.url === '/api/venues') return json(response, [location])
    const events = Array.from({ length: 12 }, (_, index) => ({ ...event, id: index + 1 }))
    json(response, { events, page: 1, hasNext: true })
  })
  const directory = await springDirectory(origin, { ...filters, venue: 999 })
  assert.equal(directory.rows.length, 12)
  assert.equal(directory.filters.venue, null)
  assert.equal(directory.hasNext, true)
  assert.deepEqual(path, ['/api/venues', '/api/events?page=1'])
})

test('rejects insecure origins, credentials, and non-root configuration', async () => {
  for (const address of ['not a URL', 'http://example.invalid', 'https://user:password@example.invalid',
    'https://example.invalid/base', 'https://example.invalid/?q=1', 'https://example.invalid/#fragment']) {
    await assert.rejects(springDirectory(address, filters), SpringCatalogUnavailable)
  }
})

test('stops at the configured origin when the catalog redirects', async t => {
  const paths = []
  const origin = await serverFor(t, (request, response) => {
    paths.push(request.url)
    response.writeHead(302, { Location: '/unexpected' })
    response.end()
  })
  await assert.rejects(springDirectory(origin, filters), SpringCatalogUnavailable)
  assert.deepEqual(paths, ['/api/venues'])
})

test('rejects upstream errors, non-JSON bodies, oversize content and invalid contracts', async t => {
  const badEvents = [
    { events: [event], page: 2, hasNext: false },
    { events: [event], page: 1, hasNext: 'no' },
    { events: [event], page: 1, hasNext: true },
    { events: [event, event], page: 1, hasNext: false },
    { events: [{ ...event, confirmed: 13 }], page: 1, hasNext: false },
    { events: [{ ...event, startsAt: 123 }], page: 1, hasNext: false },
    { events: [{ ...event, startsAt: 'invalid' }], page: 1, hasNext: false }
  ]
  const cases = [
    response => { response.writeHead(503); response.end('internal upstream detail') },
    response => { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<p>error</p>') },
    response => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('not json') },
    response => json(response, [{ ...location, name: 'x'.repeat(385 * 1024) }]),
    response => json(response, [location, location]),
    response => json(response, [{ id: 0, name: location.name }])
  ]
  for (const handler of cases) {
    const origin = await serverFor(t, (_, response) => handler(response))
    await assert.rejects(springDirectory(origin, filters), { message: 'Spring catalog unavailable' })
  }
  for (const body of badEvents) {
    const origin = await serverFor(t, (request, response) =>
      json(response, request.url === '/api/venues' ? [location] : body))
    await assert.rejects(springDirectory(origin, filters), SpringCatalogUnavailable)
  }
})

test('times out an upstream response that starts streaming and never finishes', async t => {
  const origin = await serverFor(t, (_, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.write('[')
  })
  await assert.rejects(springDirectory(origin, filters), SpringCatalogUnavailable)
})
