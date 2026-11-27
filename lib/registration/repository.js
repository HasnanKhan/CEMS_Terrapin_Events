import { query } from '../db.js'

export const registrationCounts = `
  (select count(*)::int from registrations r where r.event_id=e.id and r.status='confirmed') as confirmed,
  (select count(*)::int from registrations r where r.event_id=e.id and r.status='waitlisted') as waiting`

export const findRosterEvents = (viewer, page, pageSize) => query(`select id,title,starts_at,status from events
  where exists (select 1 from accounts where id=$1 and active and 'administrator'=any(roles))
  order by starts_at desc,id desc limit $2 offset $3`, [viewer, pageSize + 1, (page - 1) * pageSize])

export const findRoster = (id, user, administrator, organizer) => query(`select e.id,e.title,e.starts_at,e.status,a.name,a.email,
    r.status as registration_status,r.created_at
  from events e join accounts viewer on viewer.id=$2 and viewer.active
  left join registrations r on r.event_id=e.id and r.status in ('confirmed','waitlisted')
  left join accounts a on a.id=r.account_id
  where e.id=$1 and (($3 and 'administrator'=any(viewer.roles))
    or ($4 and viewer.id=e.owner_id and 'organizer'=any(viewer.roles)))
  order by r.id`, [id, user, administrator, organizer])

const ownRegistrations = `select r.*,e.title,e.starts_at,e.deadline,e.ends_at,e.status as event_status,v.name as venue,
  case when r.status='waitlisted' then (select count(*)::int from registrations w
  where w.event_id=r.event_id and w.status='waitlisted' and w.id<=r.id) end as position
  from registrations r join events e on e.id=r.event_id join venues v on v.id=e.venue_id
  where r.account_id=$1 and r.status in ('confirmed','waitlisted')`

export const findRegistrations = account => query(ownRegistrations + ' order by e.starts_at,e.id', [account])
export const findRegistration = (account, event) => query(ownRegistrations + ' and e.id=$2', [account, event])
export const findRegistrationTarget = id => query('select event_id,account_id from registrations where id=$1', [id])

export async function countStatus(db, event, status) {
  const { rows: [row] } = await db.query('select count(*)::int as count from registrations where event_id=$1 and status=$2', [event, status])
  return row.count
}

export async function insertRegistration(db, event, account, status) {
  const { rows: [row] } = await db.query(`insert into registrations(event_id,account_id,status) values($1,$2,$3)
    on conflict (event_id,account_id) where status in ('confirmed','waitlisted') do nothing returning id`,
  [event, account, status])
  return row?.id
}

export async function cancelActiveRegistration(db, event, account, registrationId, expectedStatus) {
  const { rows: [registration] } = await db.query(`with active as (
    select id,status from registrations
    where event_id=$1 and account_id=$2 and id=$3 and status in ('confirmed','waitlisted')
      and ($4::text is null or status=$4)
  )
  update registrations r set status='cancelled',cancelled_at=clock_timestamp()
  from active where r.id=active.id returning active.id,active.status`, [event, account, registrationId, expectedStatus])
  return registration
}

export const promoteWaiting = (db, event, seats) => db.query(`update registrations set status='confirmed' where id in
  (select id from registrations where event_id=$1 and status='waitlisted' order by id limit $2)
  returning account_id`, [event, seats])
