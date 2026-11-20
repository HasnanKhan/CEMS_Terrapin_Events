import { strict as assert } from 'node:assert'
import { scrypt } from 'node:crypto'
import { test } from 'node:test'
import { promisify } from 'node:util'
import { dummyHash, hashPassword, passwordNeedsUpgrade, verifyPassword } from '../lib/password.js'

test('NFR-9 stores distinct salted Argon2id hashes and verifies the full password', async () => {
  const password = 'Terp1' + '🧪'.repeat(55)
  const first = await hashPassword(password)
  const second = await hashPassword(password)
  assert.match(first, /^\$argon2id\$/)
  assert.notEqual(first, second)
  assert.equal(passwordNeedsUpgrade(first), false)
  assert.equal(await verifyPassword(password, first), true)
  assert.equal(await verifyPassword(password + 'x', first), false)
})

test('NFR-9 preserves legacy sign-ins and identifies hashes that need upgrading', async () => {
  const password = 'PreviousTerpPassword1'
  const salt = 'abcd'.repeat(8)
  const digest = await promisify(scrypt)(password, salt, 64)
  const legacy = salt + ':' + digest.toString('hex')
  assert.equal(passwordNeedsUpgrade(legacy), true)
  assert.equal(await verifyPassword(password, legacy), true)
  assert.equal(await verifyPassword('wrong password', legacy), false)
  assert.equal(await verifyPassword(password, 'broken-hash'), false)
  assert.equal(await verifyPassword(password, '$argon2id$broken-hash'), false)
  assert.equal(await verifyPassword(password, dummyHash), false)
  assert.equal(await verifyPassword('x'.repeat(129), legacy), false)
})
