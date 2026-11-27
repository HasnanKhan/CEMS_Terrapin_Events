import { findVenueCapacity, listVenues } from './repository.js'

export const venues = listVenues
export const capacityFitsVenue = async (db, id, capacity) => capacity <= (await findVenueCapacity(db, id) ?? 0)
