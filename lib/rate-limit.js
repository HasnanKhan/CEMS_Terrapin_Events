import { createHash, randomInt } from 'node:crypto'
import { isIP } from 'node:net'
import { query } from './db.js'
import { Problem } from './input.js'

const limits = { login: 20, registration: 10 }

export function clientIp(requestHeaders, onVercel = process.env.VERCEL === '1') {
  if (!onVercel) return null
  const ip = requestHeaders.get('x-forwarded-for')?.trim()
  return isIP(ip ?? '') ? ip : null
}

export async function enforceRateLimit(scope, subject) {
  // Store a digest rather than a raw IP address or account ID in the counter table.
  const key = createHash('sha256').update(String(subject)).digest('hex')
  const { rows: [{ allowed }] } = await query(
    'select consume_rate_limit($1,$2,$3) as allowed', [scope, key, limits[scope]]
  )

  if (randomInt(64) === 0) {
    // Cleanup is best-effort and must not turn an allowed request into a failure.
    try {
      await query(`delete from rate_limits where (scope, subject) in (
        select scope, subject from rate_limits where last_seen < now() - interval '1 hour'
        order by last_seen limit 200 for update skip locked
      )`)
    } catch (error) {
      console.error('Rate limit cleanup failed', error.code ?? error.name)
    }
  }

  if (!allowed) throw new Problem('Too many requests. Wait a minute and try again.')
}
