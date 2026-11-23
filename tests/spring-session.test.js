import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { register } from 'node:module'
import test from 'node:test'
import { tokenHash } from '../lib/password.js'
import { springSession, SpringSessionUnavailable } from '../lib/spring-session.js'
import { cookies, runRequest } from './support/request.js'

register('./support/resolve.js', import.meta.url)

const credential = 'ab'.repeat(32)
const digest = 'cd'.repeat(32)
const profile = { id: 7, name: 'Test attendee', email: 'test@umd.edu', roles: ['attendee', 'organizer'] }

async function serverFor(t, handler) {
  const server = createServer(handler)
  const origin = await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve('http://127.0.0.1:' + server.address().port))
  })
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
    server.closeAllConnections()
  }))
  return origin
}

function json(response, value) {
  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(value))
}

test('resolves a session through the internal POST using only the digest and service credential', async t => {
  let seen
  const origin = await serverFor(t, (request, response) => {
    seen = request
    json(response, { ...profile, upstreamOnly: 'excluded from the profile' })
  })
  assert.deepEqual(await springSession(origin, credential, digest), profile)
  assert.equal(seen.method, 'POST')
  assert.equal(seen.url, '/internal/session/resolve')
  assert.equal(seen.headers.authorization, 'Bearer ' + credential)
  assert.equal(seen.headers['x-cems-session-hash'], digest)
  assert.equal(seen.headers.cookie, undefined)
})

test('treats only a no-content response as an invalid session', async t => {
  for (const status of [204, 401, 403, 404, 503]) {
    const origin = await serverFor(t, (_, response) => response.writeHead(status).end())
    const result = springSession(origin, credential, digest)
    if (status === 204) assert.equal(await result, null)
    else await assert.rejects(result, SpringSessionUnavailable)
  }
})

test('rejects incomplete configuration and non-HTTPS remote addresses', async () => {
  for (const example of [
    [undefined, credential, digest], ['http://example.invalid', credential, digest],
    ['https://example.invalid/path', credential, digest], ['https://example.invalid', 'short', digest],
    ['https://example.invalid', credential, 'not-a-digest']
  ]) {
    await assert.rejects(springSession(...example), SpringSessionUnavailable)
  }
})

test('rejects malformed profiles and stops at redirects', async t => {
  for (const value of [null, { ...profile, id: 0 }, { ...profile, roles: ['unexpected'] },
    { ...profile, name: 'x'.repeat(4100) }]) {
    const origin = await serverFor(t, (_, response) => json(response, value))
    await assert.rejects(springSession(origin, credential, digest), SpringSessionUnavailable)
  }
  const paths = []
  const origin = await serverFor(t, (request, response) => {
    paths.push(request.url)
    response.writeHead(302, { Location: '/unexpected' }).end()
  })
  await assert.rejects(springSession(origin, credential, digest), SpringSessionUnavailable)
  assert.deepEqual(paths, ['/internal/session/resolve'])
})

test('keeps the write-session digest server-side and fails closed on an enabled service outage', async t => {
  const { currentUser } = await import('../lib/auth.js')
  const token = 'ef'.repeat(32)
  let unavailable = false
  let receivedDigest
  const origin = await serverFor(t, (request, response) => {
    receivedDigest = request.headers['x-cems-session-hash']
    if (unavailable) response.writeHead(503).end()
    else json(response, profile)
  })
  t.after(() => {
    delete process.env.SPRING_SESSION_URL
    delete process.env.SPRING_SESSION_SERVICE_TOKEN
  })
  process.env.SPRING_SESSION_URL = origin
  process.env.SPRING_SESSION_SERVICE_TOKEN = credential
  await runRequest('127.0.0.1', async () => {
    assert.equal(await currentUser(), null)
    cookies().set('terrapin_session', token)
    assert.deepEqual(await currentUser(), profile)
    assert.equal(receivedDigest, tokenHash(token))
    assert.deepEqual(await currentUser({ forWrite: true }), { ...profile, sessionHash: tokenHash(token) })
    unavailable = true
    await assert.rejects(currentUser(), SpringSessionUnavailable)
  })
})
