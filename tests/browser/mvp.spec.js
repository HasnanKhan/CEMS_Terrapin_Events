import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import pg from 'pg'
import { testDatabase } from '../support/database.js'
import { signIn } from './sign-in.js'

const password = 'BrowserAttendeeTest1'

async function signUpForEvent(page, event, email) {
  await page.goto(event)
  await page.getByRole('link', { name: /^Sign in to (register|join waitlist)$/ }).click()
  await page.getByRole('link', { name: 'Create an account' }).click()
  await page.getByLabel('Full name').fill('Browser Test Attendee')
  await page.getByLabel('UMD email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Account created. You can now sign in.')
  await signIn(page, email, password)
  await expect.poll(() => new URL(page.url()).searchParams.get('event')).toBe(new URL(event).searchParams.get('event'))
}

test('creates and approves a draft, then registers, waitlists, and promotes through the browser', async ({ browser, page }) => {
  const id = randomUUID()
  const title = 'Browser workflow ' + id
  const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  const firstContext = await browser.newContext({ viewport: { width: 360, height: 800 } })
  const secondContext = await browser.newContext()
  try {
    const first = await firstContext.newPage()
    const second = await secondContext.newPage()

    await test.step('FR-11–16: create a private draft and publish it from the approval queue', async () => {
      await page.goto('/?view=login')
      await signIn(page, 'browser-coordinator@umd.edu', 'BrowserCoordinatorTest1')
      await page.getByRole('link', { name: 'Organizer', exact: true }).click()
      await page.getByRole('link', { name: 'Create event' }).click()
      await page.getByLabel('Event title').fill(title)
      await page.getByLabel('Description').fill('End-to-end browser verification')
      await page.getByLabel('Category').selectOption('Academic')
      await page.getByLabel('Host organization').fill('Browser Test')
      await page.getByLabel('Venue').selectOption({ label: 'Iribe Center (90 seats)' })
      await page.getByLabel('Capacity', { exact: true }).fill('1')
      await page.getByLabel('Starts at').fill(day + 'T17:00')
      await page.getByLabel('Ends at').fill(day + 'T18:00')
      await page.getByLabel('Registration deadline').fill(day + 'T16:00')
      await page.getByLabel('Capacity', { exact: true }).fill('91')
      await page.getByRole('button', { name: 'Save draft' }).click()
      const validation = page.locator('form').getByRole('alert')
      await expect(validation).toHaveText('Capacity must fit the selected venue.')
      await expect(validation).toBeFocused()
      await page.getByLabel('Capacity', { exact: true }).fill('1')
      await page.getByRole('button', { name: 'Save draft' }).click()
      await expect(page.getByRole('status')).toHaveText('Draft saved.')
      const draftUrl = new URL(page.url())
      draftUrl.searchParams.delete('feedback')
      await first.goto(draftUrl.href)
      await expect(first.getByRole('heading', { name: 'Event unavailable' })).toBeVisible()

      await page.getByRole('link', { name: 'Approvals', exact: true }).click()
      await page.getByRole('link', { name: 'Event rosters', exact: true }).click()
      await page.getByRole('link', { name: title, exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Roster', exact: true })).toBeVisible()
      await expect(page.getByText('No registrations yet.')).toBeVisible()
      await first.goto(page.url())
      await expect(first.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
      await expect(first.getByText(title, { exact: true })).toHaveCount(0)
      await page.goto(draftUrl.href)

      await page.getByRole('button', { name: 'Submit for approval' }).click()
      await expect(page.getByRole('status')).toHaveText('Submitted for approval.')
      await page.getByRole('link', { name: 'Approvals', exact: true }).click()
      await page.getByRole('link', { name: title }).click()
      await page.getByRole('button', { name: 'Approve and publish' }).click()
      await expect(page.getByRole('status')).toHaveText('Event published.')
    })

    const event = new URL(page.url())
    event.searchParams.delete('feedback')
    await test.step('FR-1–9, FR-24, FR-26–33, FR-37, FR-39–40: view event details, sign up, register, and promote from the waitlist', async () => {
      const search = new URL('/?q=' + encodeURIComponent(title) + '&category=Academic', event)
      await first.goto(search.href)
      const eventLink = first.getByRole('link', { name: title, exact: true })
      await expect(eventLink).toHaveCount(1)
      const fromResults = new URL(await eventLink.getAttribute('href'), search)
      await signUpForEvent(first, fromResults.href, `browser-first-${id}@umd.edu`)
      await expect(first.getByRole('heading', { name: title })).toBeVisible()
      await expect(first.getByText('Academic', { exact: true })).toBeVisible()
      await expect(first.getByText('Hosted by Browser Test')).toBeVisible()
      await expect(first.getByText('End-to-end browser verification')).toBeVisible()
      const fact = (page, label) => page.locator('.facts > div')
        .filter({ has: page.getByText(label, { exact: true }) }).locator('dd')
      const displayDate = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', dateStyle: 'medium' })
        .format(new Date(day + 'T00:00:00Z'))
      await expect(fact(first, 'Starts')).toHaveText(displayDate + ', 5:00 PM ET')
      await expect(fact(first, 'Ends')).toHaveText(displayDate + ', 6:00 PM ET')
      await expect(fact(first, 'Venue')).toHaveText('Iribe Center')
      await expect(fact(first, 'Registration deadline')).toHaveText(displayDate + ', 4:00 PM ET')
      await expect(fact(first, 'Seats remaining')).toHaveText('1 of 1')
      await expect(fact(first, 'On the waitlist')).toHaveText('0')
      await expect(first.getByText('1 seat open', { exact: true })).toBeVisible()
      expect(await first.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
      await first.getByRole('button', { name: 'Register for event' }).click()
      await expect(first.getByRole('status')).toHaveText('Your seat is confirmed.')
      const returnLink = first.getByRole('link', { name: 'Back to results' })
      await expect(returnLink).toHaveAttribute('href', '/?' + search.searchParams + '#upcoming')
      await returnLink.click()
      await expect(first.getByRole('searchbox', { name: 'Search events' })).toHaveValue(title)
      await expect(first.getByRole('combobox', { name: 'Category' })).toHaveValue('Academic')

      await signUpForEvent(second, event.href, `browser-second-${id}@umd.edu`)
      await second.getByRole('button', { name: 'Join waitlist' }).click()
      await expect(second.getByRole('status')).toHaveText('You joined the waitlist at position 1.')
      await expect(fact(second, 'Seats remaining')).toHaveText('0 of 1')
      await expect(fact(second, 'On the waitlist')).toHaveText('1')
      const confirmation = `You’re registered for ${title}.`
      const joinedWaitlist = `You joined the waitlist for ${title} at position 1.`
      await first.getByRole('link', { name: 'Inbox', exact: true }).click()
      await expect(first.getByRole('link', { name: confirmation, exact: true })).toBeVisible()
      await expect(first.getByRole('link', { name: joinedWaitlist, exact: true })).toHaveCount(0)
      await second.getByRole('link', { name: 'Inbox', exact: true }).click()
      await expect(second.getByRole('link', { name: joinedWaitlist, exact: true })).toBeVisible()
      await expect(second.getByRole('link', { name: confirmation, exact: true })).toHaveCount(0)

      const myEvents = new URL('/?view=my', event).href
      await second.goto(myEvents)
      await expect(second.getByText('Waitlist position 1', { exact: true })).toBeVisible()
      await expect(second.getByText(/^Cancel before .* ET\.$/)).toBeVisible()
      const leave = second.locator('summary').filter({ hasText: 'Leave waitlist' })
      const confirmLeave = second.getByRole('button', { name: 'Confirm leaving waitlist for ' + title, exact: true })
      await expect(confirmLeave).toBeHidden()
      await leave.press('Enter')
      await expect(confirmLeave).toBeVisible()
      await confirmLeave.click()
      const waitlistNotice = second.getByRole('status')
      await expect(waitlistNotice).toHaveText('You left the waitlist.')
      await expect(waitlistNotice).toBeFocused()
      await expect(second.getByRole('heading', { name: 'No registrations yet', exact: true })).toBeVisible()
      await second.goto(event.href)
      await second.getByRole('button', { name: 'Join waitlist' }).click()
      await expect(second.getByRole('status')).toHaveText('You joined the waitlist at position 1.')

      const fixture = new pg.Client({ connectionString: testDatabase().href })
      await fixture.connect()
      try {
        await fixture.query("update events set deadline=now()-interval '1 second' where id=$1", [event.searchParams.get('event')])
        await first.goto(event.href)
        await expect(first.getByText('Registration closed', { exact: true })).toBeVisible()
        await expect(first.locator('summary').filter({ hasText: 'Cancel registration' })).toBeVisible()
        await first.goto(myEvents)
        const cancel = first.locator('summary').filter({ hasText: 'Cancel registration' })
        await cancel.press('Enter')
        await first.keyboard.press('Tab')
        const confirm = first.getByRole('button', { name: 'Confirm cancellation for ' + title, exact: true })
        await expect(confirm).toBeFocused()
        await first.keyboard.press('Enter')
        const cancellationNotice = first.getByRole('status')
        await expect(cancellationNotice).toHaveText('Registration cancelled.')
        await expect(cancellationNotice).toBeFocused()
        await second.getByRole('link', { name: 'Inbox', exact: true }).click()
        await expect(second.getByText(`A seat opened for ${title}. You’re confirmed.`)).toBeVisible()

        await fixture.query(`update events set starts_at=now()-interval '1 hour', ends_at=now()-interval '1 minute',
          deadline=now()-interval '2 hours' where id=$1`, [event.searchParams.get('event')])
        await second.goto(myEvents)
        await expect(second.getByRole('heading', { name: 'Past events', exact: true })).toBeVisible()
        await expect(second.getByText(/^Cancellation closed at .* ET\.$/)).toBeVisible()
        await expect(second.locator('summary').filter({ hasText: 'Cancel registration' })).toHaveCount(0)
      } finally {
        await fixture.end()
      }

      await second.goto(new URL('/?view=accounts', event).href)
      await expect(second.getByRole('heading', { name: 'Access restricted' })).toBeVisible()
      const roster = new URL(event)
      roster.searchParams.set('view','rosters')
      await page.setViewportSize({ width: 360, height: 800 })
      await page.goto(roster.href)
      const rosterTable = page.getByRole('region', { name: 'Attendee roster table' })
      await expect(rosterTable.getByRole('table')).toBeVisible()
      const rosterAxe = await new AxeBuilder({ page }).withRules(['scrollable-region-focusable']).analyze()
      expect(rosterAxe.violations).toEqual([])
      await rosterTable.focus()
      await page.keyboard.press('ArrowRight')
      await expect.poll(() => rosterTable.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
      await second.goto(roster.href)
      await expect(second.getByRole('heading', { name: 'Access restricted' })).toBeVisible()
      await expect(second.getByRole('table')).toHaveCount(0)
    })
  } finally {
    await Promise.all([firstContext.close(), secondContext.close()])
  }
})

test('account pages provide browser isolation and discourage caching', async ({ request }) => {
  const response = await request.get('/?view=login')
  expect(response.ok()).toBeTruthy()
  expect(response.headers()).toMatchObject({
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()'
  })
  expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(response.headers()['cache-control']).toContain('no-store')
})

test('readiness verifies the app can reach its PostgreSQL database', async ({ request }) => {
  const response = await request.get('/api/health')
  expect(response.status()).toBe(200)
  expect(response.headers()['cache-control']).toBe('no-store')
  expect(await response.json()).toEqual({ status: 'ok' })
})
