import { publishedEvents, visibleEvent } from '../event/service.js'

export const eventsPerPage = 12
export const publicEvents = filters => publishedEvents(filters, eventsPerPage)
export const getEvent = visibleEvent
