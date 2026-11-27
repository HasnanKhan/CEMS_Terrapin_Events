import { query } from '../db.js'

export const listVenues = () => query('select id,name,capacity from venues order by name')

export async function findVenueCapacity(db, id) {
  const { rows: [venue] } = await db.query('select capacity from venues where id=$1', [id])
  return venue?.capacity
}
