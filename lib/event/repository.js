import { query } from '../db.js'
import { registrationCounts } from '../registration/repository.js'

const eventDetails = `select e.*,v.name as venue,a.name as organizer,${registrationCounts}
  from events e join venues v on v.id=e.venue_id join accounts a on a.id=e.owner_id`

export const canReviewEvents = "exists (select 1 from accounts where id=$1 and active and 'administrator'=any(roles))"

export const findPublishedEvents = ({ keyword, category, venue, page }, pageSize) => query(eventDetails + `
  where e.status='published' and e.ends_at > now()
    and ($1='' or strpos(lower(e.title), lower($1)) > 0 or strpos(lower(e.description), lower($1)) > 0)
    and ($2='' or e.category=$2)
    and ($3::int is null or e.venue_id=$3)
  order by e.starts_at,e.id limit $4 offset $5`,
  [keyword, category, venue, pageSize + 1, (page - 1) * pageSize])

export const findOrganizerEvents = id => query(eventDetails + `
  where e.owner_id=$1 and a.active and 'organizer'=any(a.roles) order by e.starts_at,e.id`, [id])

export const findApprovalQueue = (viewer, owner) => query(eventDetails + `
  where ${canReviewEvents} and e.status='pending' and ($2::int is null or e.owner_id=$2)
  order by e.submitted_at,e.id`, [viewer, owner])

export const findApprovalOwners = viewer => query(`select distinct a.id,a.name,a.email from accounts a
  join events e on e.owner_id=a.id where ${canReviewEvents} and e.status='pending' order by a.name,a.email`, [viewer])

export async function findEventWithAccess(id, user) {
  const organizer = user?.roles.includes('organizer') ?? false
  const administrator = user?.roles.includes('administrator') ?? false
  const { rows: [event] } = await query(`select details.*,
    (details.status='published' or exists (select 1 from accounts viewer where viewer.id=$2 and viewer.active
      and (($3 and viewer.id=details.owner_id and 'organizer'=any(viewer.roles))
        or ($4 and details.status='pending' and 'administrator'=any(viewer.roles))))) as accessible
    from (${eventDetails} where e.id=$1) details`, [id, user?.id ?? null, organizer, administrator])
  return event
}

export async function lockEvent(db, id) {
  const { rows: [event] } = await db.query(`select e.*,v.capacity as venue_capacity
    from events e join venues v on v.id=e.venue_id where e.id=$1 for update of e`, [id])
  return event
}

export async function readEventCutoffs(db, event) {
  const { rows: [cutoffs] } = await db.query(`select $1::timestamptz > clock_timestamp() as future,
    $2::timestamptz > clock_timestamp() as open`, [event.starts_at, event.deadline])
  return cutoffs
}

export async function readDraftDates(db, times) {
  const { rows: [dates] } = await db.query(`select s,e,d,s > clock_timestamp() and e > s and d <= s and
    s at time zone 'America/New_York'=$1::timestamp and e at time zone 'America/New_York'=$2::timestamp and
    d at time zone 'America/New_York'=$3::timestamp as valid from (select
    $1::timestamp at time zone 'America/New_York' s,$2::timestamp at time zone 'America/New_York' e,
    $3::timestamp at time zone 'America/New_York' d) t`, times)
  return dates
}

export const updateDraft = (db, id, values) => db.query(`update events set
  (venue_id,title,description,category,host,starts_at,ends_at,deadline,capacity)=
  ($1,$2,$3,$4,$5,$6,$7,$8,$9) where id=$10`, [...values, id])

export async function insertDraft(db, owner, values) {
  const { rows: [created] } = await db.query(`insert into events
    (venue_id,title,description,category,host,starts_at,ends_at,deadline,capacity,owner_id)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`, [...values, owner])
  return created.id
}

export const pendingEvents = (db, owner) =>
  db.query("select id from events where owner_id=$1 and status='pending' limit 5", [owner])

export const submitDraft = (db, id) =>
  db.query("update events set status='pending',submitted_at=now() where id=$1", [id])

export const publishEvent = (db, id) => db.query("update events set status='published' where id=$1", [id])

export const setEventCapacity = (db, id, capacity) => db.query('update events set capacity=$2 where id=$1', [id, capacity])
