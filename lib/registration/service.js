import { audit, requireRateLimit, requireRole } from '../auth.js'
import { eventsPerPage } from '../catalog/service.js'
import { query } from '../db.js'
import { setEventCapacity } from '../event/repository.js'
import { eventTiming, eventTransaction, ownerOnly } from '../event/seat-lock.js'
import { Problem, formText, integer, optionalId } from '../input.js'
import { notify } from '../notification/service.js'
import {
  cancelActiveRegistration, countStatus, findRegistration, findRegistrations, findRoster, findRosterEvents,
  insertRegistration, promoteWaiting
} from './repository.js'

export const registrations = user => findRegistrations(user.id)
export const registration = (user, id) => findRegistration(user.id, id)

export async function rosterEvents(user, page) {
  await requireRole(user, ['administrator'], 'roster_list', null)
  return findRosterEvents(user.id, page, eventsPerPage)
}

export async function roster(id, user) {
  const administrator = user?.roles.includes('administrator') ?? false
  const organizer = user?.roles.includes('organizer') ?? false
  // Evaluate access and read personal data in the same PostgreSQL statement.
  const { rows } = await findRoster(id, user?.id ?? null, administrator, organizer)
  if (!rows.length) {
    await audit({ query }, user, 'roster_view', id, 'denied')
    return null
  }
  const { id: eventId, title, starts_at, status } = rows[0]
  return {
    event: { id: eventId, title, starts_at, status },
    rows: rows.filter(row => row.registration_status !== null)
      .map(({ name, email, registration_status, created_at }) => ({ name, email, status: registration_status, created_at }))
  }
}

async function promote(db, event, seats) {
  if (seats <= 0) return
  const { rows } = await promoteWaiting(db, event.id, seats)
  for (const { account_id } of rows) {
    await notify(db, event, account_id, 'promoted', `A seat opened for ${event.title}. You’re confirmed.`)
  }
}

export async function updateCapacity(user, target, form) {
  await requireRole(user, ['organizer'], 'capacity', optionalId(target))
  const id = integer(target)
  const result = await eventTransaction(user, 'organizer', 'capacity', id, async (db, event) => {
    if (!await ownerOnly(db, user, event, 'capacity')) return null
    if (!(await eventTiming(db, event)).future) throw new Problem('This event has already started.')
    const capacity = integer(formText(form, 'capacity'))
    const confirmed = await countStatus(db, id, 'confirmed')
    if (event.status !== 'published' || capacity < confirmed || capacity > event.venue_capacity) {
      throw new Problem('For published events, capacity must fit the venue and cover all confirmed registrations.')
    }
    await setEventCapacity(db, id, capacity)
    await promote(db, event, capacity - confirmed)
    return 'Capacity updated.'
  })
  if (!result) throw new Problem('You do not own this event.')
  return result
}

async function requireRegistrationAccess(user, target, action) {
  const eventId = optionalId(target)
  await requireRole(user, ['attendee'], action, eventId)
  await requireRateLimit('registration', user.id, user, action, eventId)
  return integer(target)
}

export async function register(user, target) {
  const action = 'registration_create'
  const id = await requireRegistrationAccess(user, target, action)
  return eventTransaction(user, 'attendee', action, id, async (db, event) => {
    const { future, open } = await eventTiming(db, event)
    if (event.status !== 'published' || !future || !open) {
      throw new Problem('Registration is closed.', { status: 422, code: 'REGISTRATION_CLOSED' })
    }
    const status = await countStatus(db, id, 'confirmed') < event.capacity ? 'confirmed' : 'waitlisted'
    const registrationId = await insertRegistration(db, id, user.id, status)
    if (!registrationId) {
      throw new Problem('You already have a registration for this event.', { status: 409, code: 'DUPLICATE_REGISTRATION' })
    }
    if (status === 'confirmed') {
      await notify(db, event, user.id, 'confirmed', `You’re registered for ${event.title}.`)
      return { id: registrationId, status, message: 'Your seat is confirmed.' }
    }
    const position = await countStatus(db, id, 'waitlisted')
    await notify(db, event, user.id, 'waitlisted', `You joined the waitlist for ${event.title} at position ${position}.`)
    return { id: registrationId, status, position, message: `You joined the waitlist at position ${position}.` }
  })
}

export async function changeRegistration(user, target, cancel) {
  if (!cancel) return (await register(user, target)).message
  const action = 'registration_cancel'
  const id = await requireRegistrationAccess(user, target, action)
  return eventTransaction(user, 'attendee', action, id, async (db, event) => {
    if (event.status !== 'published' || !(await eventTiming(db, event)).future) {
      throw new Problem('This event has already started.')
    }
    const removed = await cancelActiveRegistration(db, id, user.id)
    if (!removed) throw new Problem('You have no active registration for this event.')
    if (removed.status === 'confirmed') await promote(db, event, 1)
    return removed.status === 'waitlisted' ? 'You left the waitlist.' : 'Registration cancelled.'
  })
}
