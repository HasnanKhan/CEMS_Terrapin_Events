import { audit, authorizedTransaction } from '../auth.js'
import { Problem } from '../input.js'
import { lockEvent, readEventCutoffs } from './repository.js'

export function eventTransaction(user, role, action, id, write) {
  return authorizedTransaction(user, role, action, id, async db => {
    if (id === null) return null
    await db.query("set local lock_timeout='1500ms'")
    return lockEvent(db, id)
  }, (db, event) => {
    if (id !== null && !event) throw new Problem('Event does not exist.', { status: 404, code: 'NOT_FOUND' })
    return write(db, event)
  })
}

export async function ownerOnly(db, user, event, action) {
  if (event.owner_id === user.id) return true
  await audit(db, user, action, event.id, 'denied')
  return false
}

// Evaluate cutoffs after waiting for the event lock and checking the session.
export const eventTiming = readEventCutoffs
