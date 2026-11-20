import { scrypt, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { Algorithm, hash, verify } from '@node-rs/argon2'

const deriveLegacy = promisify(scrypt)
const options = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 }
export const dummyHash = '$argon2id$v=19$m=19456,t=2,p=1$4ft9N3hrnEc7WTEKdO9SUQ$/pLo9UbBNT+64RPVTNfFxK5D0YQSgXDou5S/nx6VpM0'
export const validEmail = email => /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@umd\.edu$/i.test(email) && email.length <= 254
export const validPassword = password => password.length >= 12 && password.length <= 128 && /[a-z]/i.test(password) && /\d/.test(password)
export const tokenHash = token => createHash('sha256').update(token).digest('hex')

export function hashPassword(password) {
  return hash(password, options)
}

export function passwordNeedsUpgrade(stored) {
  return /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored)
}

export async function verifyPassword(password, stored) {
  if (password.length > 128) return false
  if (stored.startsWith('$argon2id$')) {
    try {
      return await verify(stored, password)
    } catch {
      return false
    }
  }
  if (!passwordNeedsUpgrade(stored)) return false
  const [salt, encoded] = stored.split(':')
  return timingSafeEqual(Buffer.from(encoded, 'hex'), await deriveLegacy(password, salt, 64))
}
