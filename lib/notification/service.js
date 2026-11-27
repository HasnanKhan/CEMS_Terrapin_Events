import { query } from '../db.js'

export const inbox = user => query(`select id,event_id,message,delivered_at from notifications
  where account_id=$1 order by id desc limit 100`, [user.id])

export async function notify(db, event, account, kind, message) {
  await db.query('insert into notifications(account_id,event_id,kind,message) values($1,$2,$3,$4)', [account, event.id, kind, message])
}
