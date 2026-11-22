import { query } from './db.js'
import { audit, authorizedTransaction, requireRateLimit, requireRole } from './auth.js'
import { Problem, field, formText, integer, optionalId } from './input.js'

export const categories = ['Academic', 'Arts & Culture', 'Community', 'Sports & Recreation', 'Technology', 'Other']

const eventDetails = `select e.*,v.name as venue,a.name as organizer,
  (select count(*)::int from registrations r where r.event_id=e.id and r.status='confirmed') as confirmed,
  (select count(*)::int from registrations r where r.event_id=e.id and r.status='waitlisted') as waiting
  from events e join venues v on v.id=e.venue_id join accounts a on a.id=e.owner_id`

export const eventsPerPage = 12
export const publicEvents = ({ keyword, category, venue, page }) => query(eventDetails + `
  where e.status='published' and e.ends_at > now()
    and ($1='' or strpos(lower(e.title), lower($1)) > 0 or strpos(lower(e.description), lower($1)) > 0)
    and ($2='' or e.category=$2)
    and ($3::int is null or e.venue_id=$3)
  order by e.starts_at,e.id limit $4 offset $5`,
  [keyword, category, venue, eventsPerPage + 1, (page - 1) * eventsPerPage])
export const organizerEvents = user => query(eventDetails + ' where e.owner_id=$1 order by e.starts_at,e.id', [user.id])
export const approvalQueue = owner => query(eventDetails + " where e.status='pending' and ($1::int is null or e.owner_id=$1) order by e.submitted_at,e.id", [owner])
export const venues = () => query('select * from venues order by name')
export async function rosterEvents(user, page) {
  await requireRole(user, ['administrator'], 'roster_list', null)
  return query(`select id,title,starts_at,status from events
    order by starts_at desc,id desc limit $1 offset $2`, [eventsPerPage + 1, (page - 1) * eventsPerPage])
}

export async function roster(id, user) {
  const administrator = user?.roles.includes('administrator') ?? false
  const organizer = user?.roles.includes('organizer') ?? false
  const { rows: [event] } = await query(`select id,title,starts_at,status from events
    where id=$1 and ($2 or ($3 and owner_id=$4))`, [id, administrator, organizer, user?.id ?? null])
  if (!event) {
    if (!administrator) await audit({ query }, user, 'roster_view', id, 'denied')
    return null
  }
  const { rows } = await query(`select a.name,a.email,r.status,r.created_at
    from registrations r join accounts a on a.id=r.account_id where r.event_id=$1 order by r.id`, [id])
  return { event, rows }
}

const ownRegistrations = `select r.*,e.title,e.starts_at,e.deadline,e.ends_at,e.status as event_status,v.name as venue,
  case when r.status='waitlisted' then (select count(*)::int from registrations w
    where w.event_id=r.event_id and w.status='waitlisted' and w.id<=r.id) end as position
  from registrations r join events e on e.id=r.event_id join venues v on v.id=e.venue_id where r.account_id=$1`

export const registrations = user => query(ownRegistrations + ' order by e.starts_at,e.id', [user.id])
export const registration = (user, id) => query(ownRegistrations + ' and e.id=$2', [user.id,id])

export async function getEvent(id, user) {
  const { rows: [event] } = await query(eventDetails + ' where e.id=$1', [id])
  if (!event) return null
  const owner = user?.roles.includes('organizer') && user.id === event.owner_id
  const administrator = user?.roles.includes('administrator')
  if (event.status === 'published' || owner || (administrator && event.status === 'pending')) return event
  await audit({ query }, user, 'event_view', id, 'denied')
  return null
}

async function lockedEvent(db, id) {
  const { rows: [event] } = await db.query(`select e.*,v.capacity as venue_capacity
    from events e join venues v on v.id=e.venue_id where e.id=$1 for update of e`, [id])
  if (!event) throw new Problem('Event does not exist.')
  // Read the cutoff again after waiting for a concurrent update.
  const { rows: [time] } = await db.query('select $1::timestamptz > clock_timestamp() as future,$2::timestamptz > clock_timestamp() as open', [event.starts_at,event.deadline])
  return { ...event, ...time }
}

async function ownerOnly(db, user, event, action) {
  if (event.owner_id === user.id) return true
  await audit(db, user, action, event.id, 'denied')
  return false
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

  const saved = await authorizedTransaction(user, 'organizer', 'draft_save', id, async db => {
    if (id) {
      const event = await lockedEvent(db, id)
      if (!await ownerOnly(db, user, event, 'draft_save')) return null
      if (event.status !== 'draft') throw new Problem('Only drafts can be edited.')
    }
    const { rows: [selected] } = await db.query('select capacity from venues where id=$1', [venue])
    if (!selected || capacity > selected.capacity) throw new Problem('Capacity must fit the selected venue.')
    const { rows: [dates] } = await db.query(`select s,e,d,s > now() and e > s and d <= s and
      s at time zone 'America/New_York'=$1::timestamp and e at time zone 'America/New_York'=$2::timestamp and
      d at time zone 'America/New_York'=$3::timestamp as valid from (select
      $1::timestamp at time zone 'America/New_York' s,$2::timestamp at time zone 'America/New_York' e,
      $3::timestamp at time zone 'America/New_York' d) t`, times)
    if (!dates.valid) throw new Problem('Choose valid Eastern times. Start must be in the future, end after start, and deadline at or before start.')
    const values = [venue,title,description,category,host,dates.s,dates.e,dates.d,capacity]
    if (id) {
      await db.query(`update events set (venue_id,title,description,category,host,starts_at,ends_at,deadline,capacity)=
        ($1,$2,$3,$4,$5,$6,$7,$8,$9) where id=$10`, [...values,id])
      return id
    }
    const { rows: [event] } = await db.query(`insert into events(venue_id,title,description,category,host,starts_at,ends_at,deadline,capacity,owner_id)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`, [...values,user.id])
    return event.id
  })
  if (!saved) throw new Problem('You do not own this event.')
  return saved
}

export async function changeEvent(user, target, action, form) {
  const role = action === 'approve' ? 'administrator' : 'organizer'
  await requireRole(user, [role], action, optionalId(target))
  const id = integer(target)
  const result = await authorizedTransaction(user, role, action, id, async db => {
    const event = await lockedEvent(db, id)
    if (action !== 'approve' && !await ownerOnly(db, user, event, action)) return null
    if (!event.future) throw new Problem('This event has already started.')
    if (action === 'submit') {
      const { rowCount } = await db.query("select id from events where owner_id=$1 and status='pending' limit 5", [user.id])
      if (event.status !== 'draft' || !event.open) throw new Problem('Only drafts with an open registration deadline can be submitted.')
      if (rowCount >= 5) throw new Problem('You already have five events awaiting approval.')
      await db.query("update events set status='pending',submitted_at=now() where id=$1", [id])
      return 'Submitted for approval.'
    }
    if (action === 'approve') {
      if (event.status !== 'pending' || !event.open) throw new Problem('Only pending events with an open registration deadline can be approved.')
      await db.query("update events set status='published' where id=$1", [id])
      await audit(db, user, 'event_approval', id, 'success')
      return 'Event published.'
    }
    const capacity = integer(formText(form, 'capacity'))
    const confirmed = await countConfirmed(db, id)
    if (event.status !== 'published' || capacity < confirmed || capacity > event.venue_capacity) {
      throw new Problem('For published events, capacity must fit the venue and cover all confirmed registrations.')
    }
    await db.query('update events set capacity=$2 where id=$1', [id,capacity])
    await promote(db, event, capacity - confirmed)
    return 'Capacity updated.'
  })
  if (!result) throw new Problem('You do not own this event.')
  return result
}

async function countConfirmed(db, id) {
  const { rows: [row] } = await db.query("select count(*)::int as count from registrations where event_id=$1 and status='confirmed'", [id])
  return row.count
}

async function notify(db, event, account, kind, message) {
  await db.query('insert into notifications(account_id,event_id,kind,message) values($1,$2,$3,$4)', [account,event.id,kind,message])
}

async function promote(db, event, seats) {
  if (seats <= 0) return
  const { rows } = await db.query(`update registrations set status='confirmed' where id in
    (select id from registrations where event_id=$1 and status='waitlisted' order by id limit $2)
    returning account_id`, [event.id,seats])
  for (const { account_id } of rows) {
    await notify(db,event,account_id,'promoted',`A seat opened for ${event.title}. You’re confirmed.`)
  }
}

export async function changeRegistration(user, target, cancel) {
  const action = cancel ? 'registration_cancel' : 'registration_create'
  const eventId = optionalId(target)
  await requireRole(user, ['attendee'], action, eventId)
  await requireRateLimit('registration', user.id, user, action, eventId)
  const id = integer(target)
  return authorizedTransaction(user, 'attendee', action, id, async db => {
    // Every writer takes this event lock before touching the roster.
    const event = await lockedEvent(db, id)
    if (event.status !== 'published' || !event.future || (!cancel && !event.open)) {
      throw new Problem(cancel ? 'This event has already started.' : 'Registration is closed.')
    }
    if (cancel) {
      const { rows: [removed] } = await db.query('delete from registrations where event_id=$1 and account_id=$2 returning status', [id,user.id])
      if (!removed) throw new Problem('You have no active registration for this event.')
      if (removed.status === 'confirmed') await promote(db, event, 1)
      return removed.status === 'waitlisted' ? 'You left the waitlist.' : 'Registration cancelled.'
    }

    const status = await countConfirmed(db, id) < event.capacity ? 'confirmed' : 'waitlisted'
    const { rowCount } = await db.query('insert into registrations(event_id,account_id,status) values($1,$2,$3) on conflict do nothing', [id,user.id,status])
    if (!rowCount) throw new Problem('You already have a registration for this event.')
    if (status === 'confirmed') {
      await notify(db,event,user.id,'confirmed',`You’re registered for ${event.title}.`)
      return 'Your seat is confirmed.'
    }
    const { rows: [row] } = await db.query("select count(*)::int as position from registrations where event_id=$1 and status='waitlisted'", [id])
    await notify(db,event,user.id,'waitlisted',`You joined the waitlist for ${event.title} at position ${row.position}.`)
    return `You joined the waitlist at position ${row.position}.`
  })
}
