import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'

const derive = promisify(scrypt)
export const validEmail = email => /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@umd\.edu$/i.test(email) && email.length <= 254
export const validPassword = password => password.length >= 12 && password.length <= 128 && /[a-z]/i.test(password) && /\d/.test(password)
export const tokenHash = token => createHash('sha256').update(token).digest('hex')

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  return salt + ':' + (await derive(password, salt, 64)).toString('hex')
}

export async function verifyPassword(password, stored) {
  const [salt, encoded] = stored.split(':')
  return timingSafeEqual(Buffer.from(encoded, 'hex'), await derive(password.slice(0, 128), salt, 64))
}
