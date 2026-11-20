import Link from 'next/link'
import { audit, currentUser, extraRoles } from '../lib/auth.js'
import { query } from '../lib/db.js'
import { approvalQueue, categories, eventsPerPage, getEvent, organizerEvents, publicEvents, registration, registrations, roster, venues } from '../lib/events.js'
import { optionalId } from '../lib/input.js'
import Form from './form.js'

export const dynamic = 'force-dynamic'

const zone = 'America/New_York'
const dateText = date => new Intl.DateTimeFormat('en-US', { timeZone: zone, dateStyle: 'medium', timeStyle: 'short' }).format(date)
const dayText = date => new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' }).format(date)
const timeText = date => new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(date)
const statusLabel = { draft: 'Draft', pending: 'Pending approval', published: 'Published', confirmed: 'Confirmed', waitlisted: 'Waitlisted' }
const roleLabel = { organizer: 'Organizer', administrator: 'Administrator', system_admin: 'System administrator' }
const has = (user, role) => user?.roles.includes(role)
const eventPath = id => '/?event=' + id
const authPath = (view, eventId) => '/?' + new URLSearchParams({
  view, ...(eventId ? { eventReturn: String(eventId) } : {})
})

function Badge({ status }) {
  return <span className={'badge ' + status}>{statusLabel[status]}</span>
}

function Header({ user, view }) {
  const links = [
    ['events', 'Explore', '/'],
    ...(user ? [['my', 'My events', '/?view=my'], ['inbox', 'Inbox', '/?view=inbox']] : []),
    ...(has(user,'organizer') ? [['organize','Organizer','/?view=organize']] : []),
    ...(has(user,'administrator') ? [['queue','Approvals','/?view=queue']] : []),
    ...(has(user,'system_admin') ? [['accounts','Accounts','/?view=accounts']] : [])
  ]
  return <header className="top"><div className="top-content">
    <Link href="/" className="brand"><span className="logo" aria-hidden="true">T</span>Terrapin<span>Events</span></Link>
    <nav aria-label="Main navigation">{links.map(([key,label,url]) =>
      <Link key={key} href={url} aria-current={view === key ? 'page' : undefined}>{label}</Link>)}</nav>
    {user ? <div className="account"><span>{user.name}</span><Form action="logout" label="Sign out" style="quiet" compact /></div>
      : <Link className="button quiet" href="/?view=login">Sign in</Link>}
  </div></header>
}

function Empty({ title, children }) {
  return <div className="empty"><h3>{title}</h3>{children && <p>{children}</p>}</div>
}

function SeatAvailability({ event }) {
  const seats = event.capacity - event.confirmed
  if (event.deadline <= new Date()) return <span className="availability full">Registration closed</span>
  return <span className={'availability ' + (seats ? 'open' : 'full')}>{seats ? `${seats} ${seats === 1 ? 'seat' : 'seats'} open` : 'Waitlist available'}</span>
}

const categoryThemes = { Technology: 'tech', 'Arts & Culture': 'arts', Community: 'community', Academic: 'academic', 'Sports & Recreation': 'sports' }

async function Explore({ params }) {
  const keyword = typeof params.q === 'string' ? params.q.trim().slice(0, 100) : ''
  const category = categories.includes(params.category) ? params.category : ''
  const page = optionalId(params.page) ?? 1
  const { rows: locations } = await venues()
  const venue = locations.find(location => location.id === optionalId(params.venue))?.id ?? null
  const { rows: results } = await publicEvents({ keyword, category, venue, page })
  const rows = results.slice(0, eventsPerPage)
  const filtered = Boolean(keyword || category || venue)
  function pageLink(number) {
    const search = new URLSearchParams()
    if (keyword) search.set('q', keyword)
    if (category) search.set('category', category)
    if (venue) search.set('venue', String(venue))
    if (number > 1) search.set('page', String(number))
    return (search.size ? '/?' + search : '/') + '#upcoming'
  }
  return <>
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">University of Maryland · College Park</p>
        <h1>Campus life,<br />on your calendar.</h1>
        <p>Find a workshop, meet your people, or make something happen on campus.</p>
        <a className="button hero-button" href="#upcoming">Explore events</a>
      </div>
      <div className="hero-art" aria-hidden="true"><div className="shell-pattern" /></div>
    </section>
    <section id="upcoming" className="section">
      <div className="section-heading"><h2>Upcoming events</h2><p className="section-count">{rows.length} {rows.length === 1 ? 'event' : 'events'}{(page > 1 || results.length > eventsPerPage) && ' on this page'}</p></div>
      <form action="/#upcoming" method="get" className="event-filter" key={pageLink(1)}>
        <label>Search events<input type="search" name="q" placeholder="Search by title or description" defaultValue={keyword} maxLength={100} /></label>
        <label>Category<select name="category" defaultValue={category}><option value="">All categories</option>
          {categories.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Venue<select name="venue" defaultValue={venue ?? ''}><option value="">All venues</option>
          {locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <div className="filter-actions"><button className="button primary">Search</button>
          {filtered && <Link href="/#upcoming">Clear filters</Link>}</div>
      </form>
      {rows.length ? <div className="event-grid">{rows.map(event =>
        <article key={event.id} className="event-card">
          <div className={'card-banner ' + (categoryThemes[event.category] ?? 'academic')}><span>{event.category}</span></div>
          <div className="card-body">
            <p className="event-date">{dayText(event.starts_at)} · {timeText(event.starts_at)} ET</p>
            <h3><Link href={eventPath(event.id)}>{event.title}</Link></h3>
            <p className="event-location">{event.venue}</p>
            <div className="card-footer"><SeatAvailability event={event} /><Link href={eventPath(event.id)} aria-label={'View ' + event.title}>View event</Link></div>
          </div>
        </article>)}</div>
        : filtered || page > 1
          ? <Empty title="No events found">{page > 1 ? 'Try an earlier page.' : 'Try another keyword or change your filters.'}</Empty>
          : <Empty title="No upcoming events">Published events will appear here.</Empty>}
      {(page > 1 || results.length > eventsPerPage) && <nav className="pagination" aria-label="Event pages">
        {page > 1 && <Link className="button quiet" href={pageLink(page - 1)}>Previous</Link>}
        <span>Page {page}</span>
        {results.length > eventsPerPage && <Link className="button quiet" href={pageLink(page + 1)}>Next</Link>}
      </nav>}
    </section>
  </>
}

function Auth({ signup, returnId }) {
  return <section className="narrow panel auth-panel">
    <p className="eyebrow">Terrapin Events</p>
    <h1>{signup ? 'Create an account' : 'Sign in'}</h1>
    <p>{signup ? 'Use a fictional @umd.edu address for this course demo.' : 'Sign in to manage your campus events and registrations.'}</p>
    <Form key={signup ? 'signup' : 'login'} action={signup ? 'signup' : 'login'} destination={returnId ? eventPath(returnId) : '/'} label={signup ? 'Create account' : 'Sign in'}>
      {signup && <label>Full name<input name="name" autoComplete="name" required maxLength={100} /></label>}
      <label>UMD email<input name="email" type="email" autoComplete="username" placeholder="demo@umd.edu" required maxLength={254} /></label>
      <label>Password<input name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} required maxLength={128} minLength={signup ? 12 : undefined} /></label>
      {signup && <p className="hint">Use at least 12 characters with a letter and a number.</p>}
    </Form>
    <p className="auth-alternate">{signup ? 'Already have an account? ' : 'New to Terrapin Events? '}
      <Link href={authPath(signup ? 'login' : 'signup', returnId)}>{signup ? 'Sign in' : 'Create an account'}</Link></p>
  </section>
}

function localInput(date) {
  if (!date) return ''
  const fields = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).map(part => [part.type, part.value]))
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`
}

async function EventForm({ event }) {
  const { rows } = await venues()
  return <section className="panel">
    <h2>{event ? 'Edit draft' : 'Create a draft'}</h2>
    <p className="hint">Enter all dates and times in Eastern Time.</p>
    <Form action="save" target={event?.id} label="Save draft">
      <label>Event title<input name="title" required maxLength={120} defaultValue={event?.title} /></label>
      <label>Description<textarea name="description" required rows={4} maxLength={4000} defaultValue={event?.description} /></label>
      <div className="fields">
        <label>Category<select name="category" required defaultValue={event?.category ?? ''}><option value="">Choose category</option>{categories.map(category => <option key={category}>{category}</option>)}</select></label>
        <label>Host organization<input name="host" required maxLength={120} defaultValue={event?.host} /></label>
        <label>Venue<select name="venue" required defaultValue={event?.venue_id ?? ''}><option value="">Choose venue</option>{rows.map(venue =>
          <option key={venue.id} value={venue.id}>{venue.name} ({venue.capacity} seats)</option>)}</select></label>
        <label>Capacity<input name="capacity" type="number" min="1" step="1" required defaultValue={event?.capacity} /></label>
        <label>Starts at<input name="starts" type="datetime-local" required defaultValue={localInput(event?.starts_at)} /></label>
        <label>Ends at<input name="ends" type="datetime-local" required defaultValue={localInput(event?.ends_at)} /></label>
        <label>Registration deadline<input name="deadline" type="datetime-local" required defaultValue={localInput(event?.deadline)} /></label>
      </div>
    </Form>
  </section>
}

async function EventDetail({ id, user }) {
  const event = await getEvent(id,user)
  if (!event) return <Empty title="Event unavailable">Check the event link or your access.</Empty>
  const owner = has(user,'organizer') && user.id === event.owner_id
  const administrator = has(user,'administrator')
  const published = event.status === 'published'
  const future = event.starts_at > new Date()
  const open = event.deadline > new Date()
  const [entry, people] = await Promise.all([
    published && user ? registration(user, id) : { rows: [] },
    owner || (administrator && published) ? roster(id) : { rows: [] }
  ])
  const enrolled = entry.rows[0]
  const path = eventPath(id)
  return <>
    <Link className="back" href={published ? '/' : owner ? '/?view=organize' : '/?view=queue'}>{published ? 'All events' : owner ? 'Organizer workspace' : 'Approval queue'}</Link>
    <div className="detail-heading"><p className="eyebrow">{event.category}</p><h1>{event.title}</h1><p>Hosted by {event.host}</p></div>
    <div className="detail-grid">
      <section className="panel">
        <h2>About this event</h2><p className="description">{event.description}</p>
        <dl className="facts"><div><dt>Starts</dt><dd>{dateText(event.starts_at)} ET</dd></div><div><dt>Ends</dt><dd>{dateText(event.ends_at)} ET</dd></div>
          <div><dt>Venue</dt><dd>{event.venue}</dd></div><div><dt>Registration deadline</dt><dd>{dateText(event.deadline)} ET</dd></div></dl>
      </section>
      <aside className="panel side">
        <h2>{published ? 'Registration' : 'Event status'}</h2><Badge status={event.status} />
        <dl className="facts"><div><dt>Seats remaining</dt><dd>{event.capacity - event.confirmed} of {event.capacity}</dd></div>
          <div><dt>On the waitlist</dt><dd>{event.waiting}</dd></div></dl>
        {enrolled && <p><Badge status={enrolled.status} /> {enrolled.position && `Position ${enrolled.position}`}</p>}
        {published && enrolled && future && <Form action="cancel" target={id} destination={path} label="Cancel registration" style="quiet" />}
        {published && !enrolled && open && (user
          ? <Form action="register" target={id} destination={path} label={event.capacity > event.confirmed ? 'Register for event' : 'Join waitlist'} />
          : <Link className="button primary" href={authPath('login', id)}>Sign in to register</Link>)}
        {published && !open && <p>Registration is closed.</p>}
        {owner && event.status === 'draft' && open && <Form action="submit" target={id} destination={path} label="Submit for approval" />}
        {administrator && event.status === 'pending' && open && <Form action="approve" target={id} destination={path} label="Approve and publish" />}
        {owner && published && future && <Form action="capacity" target={id} destination={path} label="Update capacity" style="quiet">
          <label>Event capacity<input type="number" name="capacity" min={Math.max(1,event.confirmed)} defaultValue={event.capacity} required /></label>
        </Form>}
      </aside>
    </div>
    {owner && event.status === 'draft' && <EventForm event={event} />}
    {(owner || (administrator && published)) && <section className="panel roster"><h2>Roster</h2>
      {people.rows.length ? <div className="table-scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Registered</th><th>Status</th></tr></thead><tbody>
        {people.rows.map(person => <tr key={person.email}><td>{person.name}</td><td>{person.email}</td><td>{dateText(person.created_at)} ET</td><td><Badge status={person.status} /></td></tr>)}
      </tbody></table></div> : <p>No registrations yet.</p>}</section>}
  </>
}

async function Organizer({ user, create }) {
  const { rows } = await organizerEvents(user)
  return <>
    <PageHeading title="Organizer workspace" description="Manage drafts, submissions, and published events.">
      <Link href="/?view=organize&create=1" className="button primary">Create event</Link>
    </PageHeading>
    {create && <EventForm />}
    <EventList rows={rows} empty="You haven’t created any events yet." />
  </>
}

function PageHeading({ title, description, children }) {
  return <div className="page-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{children}</div>
}

function EventList({ rows, empty, queue = false }) {
  return rows.length ? <ul className="rows">{rows.map(event => <li key={event.id} className="row">
    <div><Link href={eventPath(event.id)} className="row-title">{event.title}</Link>
      <p>{queue ? `Submitted ${dateText(event.submitted_at)} ET · ${event.organizer}` : `${dateText(event.starts_at)} ET · ${event.venue}`}</p></div>
    <Badge status={event.status} />
  </li>)}</ul> : <Empty title={empty} />
}

async function Queue({ owner }) {
  const [list, owners] = await Promise.all([approvalQueue(owner), query(`select distinct a.id,a.name,a.email from accounts a
    join events e on e.owner_id=a.id where e.status='pending' order by a.name,a.email`)])
  return <><PageHeading title="Approval queue" description="Review submissions in the order they were received." />
    <form className="filter"><input type="hidden" name="view" value="queue" /><label>Organizer<select name="owner" defaultValue={owner ?? ''}>
      <option value="">All organizers</option>{owners.rows.map(item => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}
    </select></label><button className="button quiet">Apply filter</button></form>
    <EventList rows={list.rows} queue empty="No events awaiting approval." /></>
}

async function MyEvents({ user }) {
  const { rows } = await registrations(user)
  return <><PageHeading title="My events" description="View your confirmed seats and waitlist positions." />
    {rows.length ? <ul className="rows">{rows.map(event => <li key={event.id} className="row">
      <div><Link className="row-title" href={eventPath(event.event_id)}>{event.title}</Link><p>{dateText(event.starts_at)} ET · {event.venue}</p></div>
      <div className="row-actions"><Badge status={event.status} />{event.position && <span>Position {event.position}</span>}
        {event.starts_at > new Date() && <Form action="cancel" target={event.event_id} destination="/?view=my" label="Cancel" style="quiet" compact />}
      </div></li>)}</ul> : <Empty title="No registrations yet"><Link href="/">Explore upcoming events</Link></Empty>}</>
}

async function Inbox({ user }) {
  const { rows } = await query('select * from notifications where account_id=$1 order by id desc limit 100', [user.id])
  return <><PageHeading title="Inbox" description="Registration and waitlist updates appear here." />
    {rows.length ? <ul className="rows">{rows.map(item => <li key={item.id} className="row"><div>
      <Link className="row-title" href={eventPath(item.event_id)}>{item.message}</Link><p>{dateText(item.delivered_at)} ET</p>
    </div></li>)}</ul> : <Empty title="You’re all caught up" />}</>
}

async function Accounts() {
  const { rows } = await query('select id,name,email,roles,active from accounts order by name,email')
  return <><PageHeading title="Accounts" description="Manage access and account status for course demo users." />
    <div className="account-grid">{rows.map(account => <section className="panel" key={account.id}>
      <h2>{account.name}</h2><p>{account.email}</p>
      <Form action="account" target={account.id} destination="/?view=accounts" label="Save account" style="quiet">
        <fieldset><legend>Roles</legend><p className="hint">Every account has the Attendee role.</p>
          {extraRoles.map(role => <label key={role} className="checkbox"><input type="checkbox" name="role" value={role} defaultChecked={account.roles.includes(role)} />{roleLabel[role]}</label>)}
        </fieldset>
        <label className="checkbox"><input type="checkbox" name="active" defaultChecked={account.active} />Active account</label>
      </Form>
    </section>)}</div></>
}

export default async function Page({ searchParams }) {
  const params = await searchParams
  const user = await currentUser()
  const view = typeof params.view === 'string' ? params.view : 'events'
  const id = optionalId(params.event)
  const required = { my: 'attendee', inbox: 'attendee', organize: 'organizer', queue: 'administrator', accounts: 'system_admin' }
  const role = Object.hasOwn(required,view) ? required[view] : null
  let content
  if (id) content = <EventDetail id={id} user={user} />
  else if (view === 'login' || view === 'signup') content = <Auth signup={view === 'signup'} returnId={optionalId(params.eventReturn)} />
  else if (role && !user) content = <Auth />
  else if (role && !has(user,role)) {
    await audit({ query }, user, 'page_view', view, 'denied')
    content = <Empty title="Access restricted">Your account doesn’t have access to this page.</Empty>
  }
  else if (view === 'my') content = <MyEvents user={user} />
  else if (view === 'inbox') content = <Inbox user={user} />
  else if (view === 'organize') content = <Organizer user={user} create={params.create === '1'} />
  else if (view === 'queue') content = <Queue owner={optionalId(params.owner)} />
  else if (view === 'accounts') content = <Accounts />
  else content = <Explore params={params} />
  return <>
    <a className="skip" href="#main">Skip to content</a>
    <Header user={user} view={id ? 'event' : view} />
    <main id="main" className="wrap">
      {typeof params.notice === 'string' && <p className="notice" role="status">{params.notice.slice(0, 160)}</p>}
      {content}
    </main>
    <footer className="footer"><div><strong>Terrapin Events</strong><span>University of Maryland course demo</span></div></footer>
  </>
}
