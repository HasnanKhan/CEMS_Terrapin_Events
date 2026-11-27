import Link from 'next/link'
import { accountDirectory, audit, currentUser, extraRoles, selfSignupEnabled } from '../lib/auth.js'
import { query } from '../lib/db.js'
import { eventsPerPage, getEvent, publicEvents } from '../lib/catalog/service.js'
import { approvalOwners, approvalQueue, categories, organizerEvents } from '../lib/event/service.js'
import { inbox } from '../lib/notification/service.js'
import { registration, registrations, roster, rosterEvents } from '../lib/registration/service.js'
import { venues } from '../lib/venue/service.js'
import { optionalId } from '../lib/input.js'
import { springDirectory, SpringCatalogUnavailable } from '../lib/spring-catalog.js'
import { actionFeedback } from './feedback.js'
import Form, { ActionNotice } from './form.js'
import { authPath, browseFilters, browsePath, eventPath, pageRoute } from './navigation.js'

export const dynamic = 'force-dynamic'

const zone = 'America/New_York'
const dateText = date => new Intl.DateTimeFormat('en-US', { timeZone: zone, dateStyle: 'medium', timeStyle: 'short' }).format(date)
const dayText = date => new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' }).format(date)
const timeText = date => new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(date)
const statusLabel = { draft: 'Draft', pending: 'Pending approval', published: 'Published', confirmed: 'Confirmed', waitlisted: 'Waitlisted' }
const roleLabel = { organizer: 'Organizer', administrator: 'Administrator', system_admin: 'System administrator' }
const has = (user, role) => user?.roles.includes(role)
const rosterPath = id => '/?view=rosters' + (id ? '&event=' + id : '')

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

function Empty({ title, children, heading: Heading = 'h3' }) {
  return <div className="empty"><Heading>{title}</Heading>{children && <p>{children}</p>}</div>
}

function SeatAvailability({ event, now = new Date() }) {
  const seats = event.capacity - event.confirmed
  if (event.deadline <= now) return <span className="availability full">Registration closed</span>
  return <span className={'availability ' + (seats ? 'open' : 'full')}>{seats ? `${seats} ${seats === 1 ? 'seat' : 'seats'} open` : 'Waitlist available'}</span>
}

const categoryThemes = { Technology: 'tech', 'Arts & Culture': 'arts', Community: 'community', Academic: 'academic', 'Sports & Recreation': 'sports' }

async function postgresDirectory(filters) {
  const { rows: locations } = await venues()
  const venue = locations.find(location => location.id === filters.venue)?.id ?? null
  const search = { ...filters, venue }
  const { rows } = await publicEvents(search)
  return { locations, filters: search, rows: rows.slice(0, eventsPerPage), hasNext: rows.length > eventsPerPage }
}

async function Explore({ params }) {
  const requested = browseFilters(params)
  const spring = process.env.SPRING_CATALOG_URL?.trim()
  const directory = await (spring ? springDirectory(spring, requested) : postgresDirectory(requested)).catch(error => {
    if (!(error instanceof SpringCatalogUnavailable)) throw error
    console.error('Spring catalog unavailable')
    return null
  })
  if (!directory) {
    return <><PageHeading title="Upcoming events" />
      <Empty title="Event directory temporarily unavailable" heading="h2">Refresh the page to try again.</Empty>
    </>
  }
  const { locations, filters, rows, hasNext } = directory
  const { keyword, category, venue, page } = filters
  const filtered = Boolean(keyword || category || venue)
  const showHero = !filtered && page === 1
  const Heading = showHero ? 'h2' : 'h1'
  const ResultHeading = showHero ? 'h3' : 'h2'
  const now = new Date()
  return <>
    {showHero && <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">University of Maryland · College Park</p>
        <h1>Campus life,<br />on your calendar.</h1>
        <p>Find a workshop, meet your people, or make something happen on campus.</p>
        <a className="button hero-button" href="#upcoming">Explore events</a>
      </div>
      <div className="hero-art" aria-hidden="true"><div className="shell-pattern" /></div>
    </section>}
    <section className={showHero ? 'section' : undefined} aria-labelledby="upcoming">
      <div className="section-heading"><Heading id="upcoming" tabIndex={-1}>Upcoming events</Heading>{rows.length > 0 &&
        <p className="section-count">{rows.length} {rows.length === 1 ? 'event' : 'events'}{(page > 1 || hasNext) && ' on this page'}</p>}</div>
      <form action={browsePath()} method="get" className="event-filter" key={browsePath({ ...filters, page: 1 })}>
        <label>Search events<input type="search" name="q" placeholder="Search by title or description" defaultValue={keyword} maxLength={100} /></label>
        <label>Category<select name="category" defaultValue={category}><option value="">All categories</option>
          {categories.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Venue<select name="venue" defaultValue={venue ?? ''}><option value="">All venues</option>
          {locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <div className="filter-actions"><button className="button primary">Search</button>
          {filtered && <Link href={browsePath()}>Clear filters</Link>}</div>
      </form>
      {rows.length ? <div className="event-grid">{rows.map(event =>
        <article key={event.id} className="event-card">
          <div className={'card-banner ' + (categoryThemes[event.category] ?? 'academic')}><span>{event.category}</span></div>
          <div className="card-body">
            <p className="event-date">{dayText(event.starts_at)} · {timeText(event.starts_at)} ET</p>
            <ResultHeading className="event-title"><Link href={eventPath(event.id, filters)}>{event.title}</Link></ResultHeading>
            <p className="event-location">{event.venue}</p>
            <div className="card-footer"><SeatAvailability event={event} now={now} /></div>
          </div>
        </article>)}</div>
        : filtered || page > 1
          ? <Empty title="No events found" heading={ResultHeading}>{page > 1
            ? <Link href={browsePath({ ...filters, page: 1 })}>Return to the first page of results</Link>
            : 'Try another keyword or change your filters.'}</Empty>
          : <Empty title="No upcoming events">Published events will appear here.</Empty>}
      {(page > 1 || hasNext) && <nav className="pagination" aria-label="Event pages">
        {page > 1 && <Link className="button quiet" href={browsePath({ ...filters, page: page - 1 })}>Previous</Link>}
        <span>Page {page}</span>
        {hasNext && <Link className="button quiet" href={browsePath({ ...filters, page: page + 1 })}>Next</Link>}
      </nav>}
    </section>
  </>
}

function Auth({ signup, returnId, filters }) {
  const allowSignup = selfSignupEnabled()
  if (signup && !allowSignup) {
    return <section className="narrow panel auth-panel">
      <h1>Account creation is unavailable</h1>
      <Link className="button primary" href={authPath('login', returnId, filters)}>Sign in</Link>
    </section>
  }
  return <section className="narrow panel auth-panel">
    <p className="eyebrow">Terrapin Events</p>
    <h1>{signup ? 'Create an account' : 'Sign in'}</h1>
    <p>{signup ? 'Use a fictional @umd.edu address for this course demo.' : 'Sign in to manage your campus events and registrations.'}</p>
    <Form key={signup ? 'signup' : 'login'} action={signup ? 'signup' : 'login'} destination={returnId ? eventPath(returnId, filters) : '/'} label={signup ? 'Create account' : 'Sign in'}>
      {signup && <label>Full name<input name="name" autoComplete="name" required maxLength={100} /></label>}
      <label>UMD email<input name="email" type="email" autoComplete="username" placeholder="demo@umd.edu" required maxLength={254} /></label>
      <label>Password<input name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} required maxLength={128} minLength={signup ? 12 : undefined} /></label>
      {signup && <p className="hint">Use at least 12 characters with a letter and a number.</p>}
    </Form>
    {allowSignup && <p className="auth-alternate">{signup ? 'Already have an account? ' : 'New to Terrapin Events? '}
      <Link href={authPath(signup ? 'login' : 'signup', returnId, filters)}>{signup ? 'Sign in' : 'Create an account'}</Link></p>}
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

async function EventDetail({ id, user, filters }) {
  const event = await getEvent(id,user)
  if (!event) return <Empty title="Event unavailable">Check the event link or your access.</Empty>
  const owner = has(user,'organizer') && user.id === event.owner_id
  const administrator = has(user,'administrator')
  const published = event.status === 'published'
  const now = new Date()
  const future = event.starts_at > now
  const open = event.deadline > now
  const hasSeat = event.capacity > event.confirmed
  const [entry, people] = await Promise.all([
    published && user ? registration(user, id) : { rows: [] },
    owner || (administrator && published) ? roster(id,user) : null
  ])
  const enrolled = entry.rows[0]
  const path = eventPath(id, filters)
  const directory = browsePath(filters)
  return <>
    <Link className="back" href={published ? directory : owner ? '/?view=organize' : '/?view=queue'}>
      {published ? directory === browsePath() ? 'All events' : 'Back to results' : owner ? 'Organizer workspace' : 'Approval queue'}
    </Link>
    <div className="detail-heading"><p className="eyebrow">{event.category}</p><h1>{event.title}</h1><p>Hosted by {event.host}</p></div>
    <div className="detail-grid">
      <section className="panel">
        <h2>About this event</h2><p className="description">{event.description}</p>
        <dl className="facts"><div><dt>Starts</dt><dd>{dateText(event.starts_at)} ET</dd></div><div><dt>Ends</dt><dd>{dateText(event.ends_at)} ET</dd></div>
          <div><dt>Venue</dt><dd>{event.venue}</dd></div>
          {!published && <div><dt>Registration deadline</dt><dd>{dateText(event.deadline)} ET</dd></div>}</dl>
      </section>
      <aside className="panel side">
        <h2>{published ? 'Registration' : 'Event status'}</h2>
        {published ? <SeatAvailability event={event} now={now} /> : <Badge status={event.status} />}
        <dl className="facts"><div><dt>Seats remaining</dt><dd>{event.capacity - event.confirmed} of {event.capacity}</dd></div>
          <div><dt>On the waitlist</dt><dd>{event.waiting}</dd></div>
          {published && <div><dt>Registration deadline</dt><dd>{dateText(event.deadline)} ET</dd></div>}</dl>
        {published && enrolled && <>
          <RegistrationStatus entry={enrolled} />
          <Cancellation entry={enrolled} event={event} now={now} destination={path} />
        </>}
        {published && !enrolled && open && (user
          ? <Form action="register" target={id} destination={path} label={hasSeat ? 'Register for event' : 'Join waitlist'} />
          : <Link className="button primary" href={authPath('login', id, filters)}>{hasSeat ? 'Sign in to register' : 'Sign in to join waitlist'}</Link>)}
        {owner && event.status === 'draft' && open && <Form action="submit" target={id} destination={path} label="Submit for approval" />}
        {administrator && event.status === 'pending' && open && <Form action="approve" target={id} destination={path} label="Approve and publish" />}
        {owner && published && future && <Form action="capacity" target={id} destination={path} label="Update capacity" style="quiet">
          <label>Event capacity<input type="number" name="capacity" min={Math.max(1,event.confirmed)} defaultValue={event.capacity} required /></label>
        </Form>}
      </aside>
    </div>
    {owner && event.status === 'draft' && <EventForm event={event} />}
    {people && <RosterTable rows={people.rows} />}
  </>
}

function RosterTable({ rows }) {
  return <section className="panel roster"><h2>Roster</h2>
    {rows.length ? <div className="table-scroll" role="region" aria-label="Attendee roster table" tabIndex={0}><table><thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Registered</th><th scope="col">Status</th></tr></thead><tbody>
      {rows.map(person => <tr key={person.email}><td>{person.name}</td><td>{person.email}</td><td>{dateText(person.created_at)} ET</td><td><Badge status={person.status} /></td></tr>)}
    </tbody></table></div> : <p>No registrations yet.</p>}</section>
}

async function Rosters({ user, id, page }) {
  if (id) {
    const data = await roster(id,user)
    if (!data) return <Empty title="Roster unavailable">Check the event link and try again.</Empty>
    return <>
      <Link className="back" href={rosterPath()}>All event rosters</Link>
      <PageHeading title={data.event.title} description={dateText(data.event.starts_at) + ' ET'}>
        <Badge status={data.event.status} />
      </PageHeading>
      <RosterTable rows={data.rows} />
    </>
  }

  const { rows } = await rosterEvents(user,page)
  return <>
    <Link className="back" href="/?view=queue">Approval queue</Link>
    <PageHeading title="Event rosters" description="View registrations for drafts, pending approvals, and published events." />
    {rows.length ? <ul className="rows">{rows.slice(0,eventsPerPage).map(event =>
      <li key={event.id} className="row">
        <div><Link href={rosterPath(event.id)} className="row-title">{event.title}</Link>
          <p>{dateText(event.starts_at)} ET</p></div>
        <Badge status={event.status} />
      </li>
    )}</ul> : <Empty title="No events on this page" />}
    {(page > 1 || rows.length > eventsPerPage) && <nav className="pagination" aria-label="Roster pages">
      {page > 1 && <Link className="button quiet" href={rosterPath() + '&page=' + (page - 1)}>Previous</Link>}
      <span>Page {page}</span>
      {rows.length > eventsPerPage && <Link className="button quiet" href={rosterPath() + '&page=' + (page + 1)}>Next</Link>}
    </nav>}
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

async function Queue({ user, owner }) {
  const [list, owners] = await Promise.all([approvalQueue(user, owner), approvalOwners(user)])
  return <><PageHeading title="Approval queue" description="Review submissions in the order they were received.">
      <Link className="button quiet" href={rosterPath()}>Event rosters</Link>
    </PageHeading>
    <form className="filter"><input type="hidden" name="view" value="queue" /><label>Organizer<select name="owner" defaultValue={owner ?? ''}>
      <option value="">All organizers</option>{owners.rows.map(item => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}
    </select></label><button className="button quiet">Apply filter</button></form>
    <EventList rows={list.rows} queue empty="No events awaiting approval." /></>
}

function RegistrationStatus({ entry }) {
  return <div className="registration-status">
    <Badge status={entry.status} />
    {entry.position != null && <span>Waitlist position {entry.position}</span>}
  </div>
}

function Cancellation({ entry, event, now, destination }) {
  if (event.starts_at <= now) {
    return <p className="hint">Cancellation closed at {dateText(event.starts_at)} ET.</p>
  }

  const waitlisted = entry.status === 'waitlisted'
  const label = waitlisted ? 'Leave waitlist' : 'Cancel registration'
  return <div className="cancellation">
    <p className="hint">Cancel before {dateText(event.starts_at)} ET.</p>
    <details>
      <summary aria-label={`${label} for ${event.title}`}>{label}</summary>
      <p>{waitlisted ? 'Leaving removes your place in line.' : 'Cancelling releases your confirmed seat.'}</p>
      <Form action="cancel" target={entry.event_id} destination={destination}
        label={waitlisted ? 'Confirm leaving waitlist' : 'Confirm cancellation'}
        accessibleLabel={`${waitlisted ? 'Confirm leaving waitlist' : 'Confirm cancellation'} for ${event.title}`}
        style="quiet" />
    </details>
  </div>
}

function RegistrationList({ heading, rows, now }) {
  if (!rows.length) return null
  return <section className="registration-list">
    <h2>{heading}</h2>
    <ul className="rows">{rows.map(event => <li key={event.id} className="row registration-row">
      <div>
        <Link className="row-title" href={eventPath(event.event_id)}>{event.title}</Link>
        <p>{dateText(event.starts_at)} ET · {event.venue}</p>
        <RegistrationStatus entry={event} />
      </div>
      <Cancellation entry={event} event={event} now={now} destination="/?view=my" />
    </li>)}</ul>
  </section>
}

async function MyEvents({ user }) {
  const { rows } = await registrations(user)
  const now = new Date()
  return <><PageHeading title="My events" description="View your seats, waitlist positions, and cancellation deadlines." />
    {rows.length ? <>
      <RegistrationList heading="Upcoming and ongoing" rows={rows.filter(event => event.ends_at > now)} now={now} />
      <RegistrationList heading="Past events" rows={rows.filter(event => event.ends_at <= now).reverse()} now={now} />
    </> : <Empty title="No registrations yet"><Link href="/">Explore upcoming events</Link></Empty>}</>
}

async function Inbox({ user }) {
  const { rows } = await inbox(user)
  return <><PageHeading title="Inbox" description="Registration and waitlist updates appear here." />
    {rows.length ? <ul className="rows">{rows.map(item => <li key={item.id} className="row"><div>
      <Link className="row-title" href={eventPath(item.event_id)}>{item.message}</Link><p>{dateText(item.delivered_at)} ET</p>
    </div></li>)}</ul> : <Empty title="You’re all caught up" />}</>
}

async function Accounts({ user }) {
  const { rows } = await accountDirectory(user)
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

export async function generateMetadata({ searchParams }) {
  return { title: pageRoute(await searchParams).title + ' | Terrapin Events' }
}

export default async function Page({ searchParams }) {
  const params = await searchParams
  const [user, feedback] = await Promise.all([currentUser(), actionFeedback(params)])
  const { view, id, role } = pageRoute(params)
  let content
  if (id && view !== 'rosters') content = <EventDetail id={id} user={user} filters={browseFilters(params)} />
  else if (view === 'login' || view === 'signup') content = <Auth signup={view === 'signup'} returnId={optionalId(params.eventReturn)} filters={browseFilters(params)} />
  else if (role && !has(user,role)) {
    await audit({ query }, user, view === 'rosters' && id ? 'roster_view' : 'page_view', view === 'rosters' && id ? id : view, 'denied')
    content = user ? <Empty title="Access restricted">Your account doesn’t have access to this page.</Empty> : <Auth />
  }
  else if (view === 'my') content = <MyEvents user={user} />
  else if (view === 'inbox') content = <Inbox user={user} />
  else if (view === 'organize') content = <Organizer user={user} create={params.create === '1'} />
  else if (view === 'queue') content = <Queue user={user} owner={optionalId(params.owner)} />
  else if (view === 'rosters') content = <Rosters user={user} id={id} page={optionalId(params.page) ?? 1} />
  else if (view === 'accounts') content = <Accounts user={user} />
  else content = <Explore params={params} />
  return <>
    <a className="skip" href="#main">Skip to content</a>
    <Header user={user} view={view === 'rosters' ? 'queue' : id ? 'event' : view} />
    <main id="main" className="wrap" tabIndex={-1}>
      {feedback && <ActionNotice key={params.feedback} message={feedback} />}
      {content}
    </main>
    <footer className="footer"><div><strong>Terrapin Events</strong><span>University of Maryland course demo</span></div></footer>
  </>
}
