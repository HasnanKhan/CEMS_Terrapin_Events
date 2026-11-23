import { springJson, springOrigin } from './spring-http.js'

const hexDigest = /^[0-9a-f]{64}$/
const allowedRoles = new Set(['attendee', 'organizer', 'administrator', 'system_admin'])
const maxResponseBytes = 4096

export class SpringSessionUnavailable extends Error {
  constructor() {
    super('Spring session service unavailable')
  }
}

export async function springSession(origin, serviceToken, sessionHash) {
  try {
    if (!hexDigest.test(serviceToken) || !hexDigest.test(sessionHash)) throw new SpringSessionUnavailable()
    const response = await fetch(new URL('/internal/session/resolve', springOrigin(origin)), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + serviceToken,
        'X-CEMS-Session-Hash': sessionHash
      },
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(3000)
    })
    if (response.status === 204) return null
    if (response.status !== 200) {
      await response.body?.cancel()
      throw new SpringSessionUnavailable()
    }
    const user = await springJson(response, maxResponseBytes)
    if (!Number.isInteger(user?.id) || user.id < 1 || user.id > 2147483647 ||
        typeof user.name !== 'string' || typeof user.email !== 'string' || !Array.isArray(user.roles) ||
        !user.roles.every(role => allowedRoles.has(role))) {
      throw new SpringSessionUnavailable()
    }
    const { id, name, email, roles } = user
    return { id, name, email, roles }
  } catch {
    throw new SpringSessionUnavailable()
  }
}
