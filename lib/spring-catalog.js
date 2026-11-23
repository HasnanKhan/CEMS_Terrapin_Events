import { springJson, springOrigin } from './spring-http.js'

const pageSize = 12
const maxResponseBytes = 384 * 1024

export class SpringCatalogUnavailable extends Error {
  constructor() {
    super('Spring catalog unavailable')
  }
}

async function catalogJson(url, signal) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    signal
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new SpringCatalogUnavailable()
  }
  return springJson(response, maxResponseBytes)
}

const positiveId = value => Number.isInteger(value) && value > 0 && value <= 2147483647
const hasText = value => typeof value === 'string' && value.trim().length > 0
const uniqueIds = rows => new Set(rows.map(row => row.id)).size === rows.length

function readVenues(value) {
  if (!Array.isArray(value) || !value.every(row => positiveId(row?.id) && hasText(row?.name)) || !uniqueIds(value)) {
    throw new SpringCatalogUnavailable()
  }
  return value.map(({ id, name }) => ({ id, name }))
}

function catalogDate(value) {
  if (typeof value !== 'string') throw new SpringCatalogUnavailable()
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new SpringCatalogUnavailable()
  return date
}

function readEvents(value, page) {
  if (value?.page !== page || typeof value?.hasNext !== 'boolean' || !Array.isArray(value?.events)
    || value.events.length > pageSize || (value.hasNext && value.events.length !== pageSize)) {
    throw new SpringCatalogUnavailable()
  }
  const rows = value.events.map(event => {
    if (!positiveId(event?.id) || !hasText(event.title) || !hasText(event.category) || !hasText(event.venue)
      || !positiveId(event.capacity) || !Number.isInteger(event.confirmed)
      || event.confirmed < 0 || event.confirmed > event.capacity) {
      throw new SpringCatalogUnavailable()
    }
    return {
      id: event.id,
      title: event.title,
      category: event.category,
      venue: event.venue,
      capacity: event.capacity,
      confirmed: event.confirmed,
      starts_at: catalogDate(event.startsAt),
      deadline: catalogDate(event.registrationDeadline)
    }
  })
  if (!uniqueIds(rows)) throw new SpringCatalogUnavailable()
  return { rows, hasNext: value.hasNext }
}

export async function springDirectory(value, filters) {
  try {
    const origin = springOrigin(value)
    const signal = AbortSignal.timeout(3000)
    const locations = readVenues(await catalogJson(new URL('/api/venues', origin), signal))
    const venue = locations.some(location => location.id === filters.venue) ? filters.venue : null

    const search = new URLSearchParams({ page: String(filters.page) })
    if (filters.keyword) search.set('q', filters.keyword)
    if (filters.category) search.set('category', filters.category)
    if (venue) search.set('venue', String(venue))
    const events = await catalogJson(new URL('/api/events?' + search, origin), signal)
    return { locations, filters: { ...filters, venue }, ...readEvents(events, filters.page) }
  } catch {
    throw new SpringCatalogUnavailable()
  }
}
