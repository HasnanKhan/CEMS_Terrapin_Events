import { categories } from '../lib/event/service.js'
import { optionalId } from '../lib/input.js'

const views = {
  events: { title: 'Explore campus events' },
  login: { title: 'Sign in' },
  signup: { title: 'Create an account' },
  my: { title: 'My events', role: 'attendee' },
  inbox: { title: 'Inbox', role: 'attendee' },
  organize: { title: 'Organizer workspace', role: 'organizer' },
  queue: { title: 'Approval queue', role: 'administrator' },
  rosters: { title: 'Event rosters', role: 'administrator' },
  accounts: { title: 'Accounts', role: 'system_admin' }
}

export function pageRoute(params) {
  const view = typeof params.view === 'string' && Object.hasOwn(views, params.view) ? params.view : 'events'
  const id = optionalId(params.event)
  const details = id && view !== 'rosters'
  return { view, id, role: views[view].role, title: details ? 'Event details' : views[view].title }
}

export function browseFilters(params) {
  return {
    keyword: typeof params.q === 'string' ? params.q.replaceAll('\0', '').trim().slice(0, 100) : '',
    category: categories.includes(params.category) ? params.category : '',
    venue: optionalId(params.venue),
    page: optionalId(params.page) ?? 1
  }
}

function addFilters(search, { keyword, category, venue, page } = {}) {
  if (keyword) search.set('q', keyword)
  if (category) search.set('category', category)
  if (venue) search.set('venue', String(venue))
  if (page > 1) search.set('page', String(page))
  return search
}

export function browsePath(filters) {
  const search = addFilters(new URLSearchParams(), filters)
  return (search.size ? '/?' + search : '/') + '#upcoming'
}

export const eventPath = (id, filters) => '/?' + addFilters(new URLSearchParams({ event: id }), filters)

export function authPath(view, eventId, filters) {
  const search = new URLSearchParams({ view })
  if (eventId) {
    search.set('eventReturn', String(eventId))
    addFilters(search, filters)
  }
  return '/?' + search
}

export function actionDestination(destination) {
  if (typeof destination !== 'string' || !destination.startsWith('/?')) return '/'
  const url = new URL(destination, 'https://terrapin.invalid')
  if (url.hash || url.pathname !== '/') return '/'
  const params = Object.fromEntries(url.searchParams)
  const id = optionalId(params.event)
  if (id && !params.view) return eventPath(id, browseFilters(params))
  return /^(my|inbox|organize|queue|accounts)$/.test(params.view) ? '/?view=' + params.view : '/'
}
