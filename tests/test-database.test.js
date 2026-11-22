import assert from 'node:assert/strict'
import test from 'node:test'
import { testDatabase } from './support/database.js'

test('fixture URLs keep the explicitly selected loopback database and port', () => {
  assert.equal(testDatabase('postgresql://owner:fixture@127.0.0.1:6543/disposable').href,
    'postgresql://owner:fixture@127.0.0.1:6543/disposable')
  assert.equal(testDatabase('postgres://localhost/disposable').port, '5432')
  assert.equal(testDatabase('postgresql://[::1]:6543/disposable').hostname, '[::1]')
})

test('fixture URLs reject connection options, invalid hosts, and implicit databases', () => {
  for (const url of [
    'postgresql://localhost:5432/fixture?application_name=example',
    'postgresql://localhost:5432/fixture#fragment',
    'postgresql://example.invalid/fixture',
    'postgresql://localhost:5432/',
    'https://localhost/fixture',
    'malformed url with private input'
  ]) {
    assert.throws(() => testDatabase(url, 'TEST_RUNTIME_DATABASE_URL'), {
      message: 'TEST_RUNTIME_DATABASE_URL must be a plain PostgreSQL URL for an isolated localhost database.'
    })
  }
})
