import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import pg from 'pg'
import { hashPassword } from '../../lib/password.js'
import { testDatabase } from '../support/database.js'
import { signIn } from './sign-in.js'

const workspaces = [
  { view: 'my', heading: 'My events', role: 'attendee' },
  { view: 'inbox', heading: 'Inbox', role: 'attendee' },
  { view: 'organize', heading: 'Organizer workspace', role: 'organizer' },
  { view: 'queue', heading: 'Approval queue', role: 'administrator' },
  { view: 'rosters', heading: 'Event rosters', role: 'administrator' },
  { view: 'accounts', heading: 'Accounts', role: 'system_admin' }
]

const actors = [
  { name: 'Guest', roles: [] },
  { name: 'Attendee', roles: ['attendee'] },
  { name: 'Owner', roles: ['attendee', 'organizer'] },
  { name: 'Other organizer', roles: ['attendee', 'organizer'] },
  { name: 'Approver', roles: ['attendee', 'administrator'] },
  { name: 'Account manager', roles: ['attendee', 'system_admin'] }
]

test('scopes workspace, event, and roster visibility by role and ownership', async ({ browser, baseURL }) => {
  test.setTimeout(90000)
  const fixtures = new pg.Pool({ connectionString: testDatabase().href })
  const marker = randomUUID()
  const password = 'VisibilityTestPassword1'
  const accounts = new Map()
  const events = new Map()
  const checkedWorkspaces = new Set()
  try {
    const hash = await hashPassword(password)
    for (const { name, roles } of actors.filter(actor => actor.roles.length)) {
      const email = `visibility-${accounts.size}-${marker}@umd.edu`
      const { rows: [account] } = await fixtures.query(
        'insert into accounts(name,email,password_hash,roles) values($1,$2,$3,$4) returning id,email',
        [name, email, hash, roles])
      accounts.set(name, account)
    }

    const description = 'Visibility fixture ' + marker
    for (const status of ['draft', 'pending', 'published']) {
      const title = `Matrix ${status} ${marker}`
      const { rows: [event] } = await fixtures.query(`insert into events
        (owner_id,venue_id,title,description,category,host,starts_at,ends_at,deadline,capacity,status,submitted_at)
        select $1,id,$2,$3,'Academic','Test organizer',now()+interval '2 days',
          now()+interval '49 hours',now()+interval '47 hours',5,$4,now()
        from venues where name='Iribe Center' returning id,title`, [accounts.get('Owner').id, title, description, status])
      events.set(status, event)
    }
    const attendee = accounts.get('Attendee')
    await fixtures.query("insert into registrations(event_id,account_id,status) values($1,$2,'confirmed')",
      [events.get('published').id, attendee.id])

    for (const { name, roles } of actors) {
      await test.step(name, async () => {
        const context = await browser.newContext({ baseURL })
        try {
          const page = await context.newPage()
          const account = accounts.get(name)
          if (account) {
            await page.goto('/?view=login')
            await signIn(page, account.email, password)
          }

          for (const { view, heading, role } of workspaces) {
            const allowed = roles.includes(role)
            const expectedHeading = allowed ? heading : account ? 'Access restricted' : 'Sign in'
            await page.goto('/?view=' + view)
            await expect(page.getByRole('heading', { name: expectedHeading, exact: true })).toBeVisible()
            if (!allowed) await expect(page.getByRole('heading', { name: heading, exact: true })).toHaveCount(0)
            if (allowed && !checkedWorkspaces.has(view)) {
              const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
              expect(audit.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) })), view).toEqual([])
              checkedWorkspaces.add(view)
            }
          }

          const ownsEvent = name === 'Owner'
          const reviewsEvents = roles.includes('administrator')
          for (const [status, { id, title }] of events) {
            const allowed = status === 'published' || ownsEvent || (status === 'pending' && reviewsEvents)
            await page.goto('/?event=' + id)
            await expect(page.getByRole('heading', { name: allowed ? title : 'Event unavailable', exact: true })).toBeVisible()
            if (allowed) await expect(page.getByRole('paragraph').filter({ hasText: description })).toBeVisible()
            else await expect(page.getByText(description, { exact: true })).toHaveCount(0)

            if (status === 'published') {
              const email = page.getByRole('cell', { name: attendee.email, exact: true })
              if (ownsEvent || reviewsEvents) {
                const rosterRow = page.getByRole('row').filter({ has: email })
                await expect(rosterRow.getByRole('cell')).toHaveText(['Attendee', attendee.email, / ET$/, 'Confirmed'])
              } else {
                await expect(page.getByRole('heading', { name: 'Roster', exact: true })).toHaveCount(0)
                await expect(email).toHaveCount(0)
              }
            }
          }

          await page.goto('/?q=' + marker)
          await expect(page.getByRole('link', { name: events.get('published').title, exact: true })).toBeVisible()
          for (const status of ['draft', 'pending']) {
            await expect(page.getByText(events.get(status).title, { exact: true })).toHaveCount(0)
          }
        } finally {
          await context.close()
        }
      })
    }
  } finally {
    try {
      const accountIds = Array.from(accounts.values(), account => account.id)
      const eventIds = Array.from(events.values(), event => event.id)
      await fixtures.query('delete from registrations where event_id=any($1)', [eventIds])
      await fixtures.query("delete from audit_entries where actor_id=any($1) or (actor_id is null and action='event_view' and target=any($2))",
        [accountIds, eventIds.map(String)])
      await fixtures.query('delete from events where id=any($1)', [eventIds])
      await fixtures.query('delete from accounts where id=any($1)', [accountIds])
    } finally {
      await fixtures.end()
    }
  }
})
