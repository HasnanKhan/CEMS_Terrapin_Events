import { audit, requireRole } from '../auth.js'
import { query } from '../db.js'
import { Problem, field, formText, integer, optionalId } from '../input.js'
import { capacityFitsVenue } from '../venue/service.js'
import {
  findApprovalOwners, findApprovalQueue, findEventWithAccess, findOrganizerEvents, findPublishedEvents,
  insertDraft, pendingEvents, publishEvent, readDraftDates, submitDraft, updateDraft
} from './repository.js'
import { eventTiming, eventTransaction, ownerOnly } from './seat-lock.js'

export const categories = ['Academic', 'Arts & Culture', 'Community', 'Sports & Recreation', 'Technology', 'Other']

export const publishedEvents = findPublishedEvents
export const organizerEvents = user => findOrganizerEvents(user.id)
export const approvalQueue = (user, owner) => findApprovalQueue(user.id, owner)
export const approvalOwners = user => findApprovalOwners(user.id)

export async function visibleEvent(id, user) {
  const event = await findEventWithAccess(id, user)
  if (!event) return null
  const { accessible, ...details } = event
  if (accessible) return details
  await audit({ query }, user, 'event_view', id, 'denied')
  return null
}

export async function saveDraft(user, target, form) {
  await requireRole(user, ['organizer'], 'draft_save', optionalId(target))
  const id = target == null ? null : integer(target)
  const title = field(form, 'title', 120)
  const description = field(form, 'description', 4000)
  const category = field(form, 'category')
  const host = field(form, 'host', 120)
  const venue = integer(formText(form, 'venue'))
  const capacity = integer(formText(form, 'capacity'))
  const times = ['starts', 'ends', 'deadline'].map(key => field(form, key))
  if (!title || !description || !host || !categories.includes(category)) throw new Problem('Complete all event fields.')
  if (times.some(time => !/^20\d\d-\d\d-\d\dT\d\d:\d\d$/.test(time) || Number.isNaN(Date.parse(time + 'Z')) ||
    new Date(time + 'Z').toISOString().slice(0, 16) !== time)) throw new Problem('Enter valid event dates and times.')

  const saved = await eventTransaction(user, 'organizer', 'draft_save', id, async (db, event) => {
    if (id) {
      if (!await ownerOnly(db, user, event, 'draft_save')) return null
      if (event.status !== 'draft') throw new Problem('Only drafts can be edited.')
    }
    if (!await capacityFitsVenue(db, venue, capacity)) throw new Problem('Capacity must fit the selected venue.')
    const dates = await readDraftDates(db, times)
    if (!dates.valid) throw new Problem('Choose valid Eastern times. Start must be in the future, end after start, and deadline at or before start.')
    const values = [venue, title, description, category, host, dates.s, dates.e, dates.d, capacity]
    if (id) {
      await updateDraft(db, id, values)
      return id
    }
    return insertDraft(db, user.id, values)
  })
  if (!saved) throw new Problem('You do not own this event.')
  return saved
}

export async function changeEvent(user, target, action) {
  if (action !== 'submit' && action !== 'approve') throw new Problem('Action unavailable.')
  const role = action === 'approve' ? 'administrator' : 'organizer'
  await requireRole(user, [role], action, optionalId(target))
  const id = integer(target)
  const result = await eventTransaction(user, role, action, id, async (db, event) => {
    if (action !== 'approve' && !await ownerOnly(db, user, event, action)) return null
    const { future, open } = await eventTiming(db, event)
    if (!future) throw new Problem('This event has already started.')
    if (action === 'submit') {
      const { rowCount } = await pendingEvents(db, user.id)
      if (event.status !== 'draft' || !open) throw new Problem('Only drafts with an open registration deadline can be submitted.')
      if (rowCount >= 5) throw new Problem('You already have five events awaiting approval.')
      await submitDraft(db, id)
      return 'Submitted for approval.'
    }
    if (event.status !== 'pending' || !open) throw new Problem('Only pending events with an open registration deadline can be approved.')
    await publishEvent(db, id)
    await audit(db, user, 'event_approval', id, 'success')
    return 'Event published.'
  })
  if (!result) throw new Problem('You do not own this event.')
  return result
}
