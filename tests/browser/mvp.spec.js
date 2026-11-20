import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

const password = 'BrowserAttendeeTest1'

async function signIn(page, email, secret) {
  await page.getByLabel('UMD email').fill(email)
  await page.getByLabel('Password').fill(secret)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Signed in.')
}

async function signUpForEvent(page, event, email) {
  await page.goto(event)
  await page.getByRole('link', { name: 'Sign in to register' }).click()
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
      await page.getByRole('button', { name: 'Save draft' }).click()
      await expect(page.getByRole('status')).toHaveText('Draft saved.')
      const draftUrl = new URL(page.url())
      draftUrl.searchParams.delete('notice')
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
    event.searchParams.delete('notice')
    await test.step('FR-1–9, FR-26–33, FR-37, FR-39–40: signup, register, and promote from the waitlist', async () => {
      await first.goto(new URL('/?q=' + encodeURIComponent(title), event).href)
      const eventLink = first.getByRole('link', { name: 'View event: ' + title, exact: true })
      await expect(eventLink).toHaveText('View event')
      await signUpForEvent(first, event.href, `browser-first-${id}@umd.edu`)
      await expect(first.getByRole('heading', { name: title })).toBeVisible()
      expect(await first.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
      await first.getByRole('button', { name: 'Register for event' }).click()
      await expect(first.getByRole('status')).toHaveText('Your seat is confirmed.')

      await signUpForEvent(second, event.href, `browser-second-${id}@umd.edu`)
      await second.getByRole('button', { name: 'Join waitlist' }).click()
      await expect(second.getByRole('status')).toHaveText('You joined the waitlist at position 1.')

      await first.getByRole('button', { name: 'Cancel registration' }).click()
      await expect(first.getByRole('status')).toHaveText('Registration cancelled.')
      await second.getByRole('link', { name: 'Inbox', exact: true }).click()
      await expect(second.getByText(`A seat opened for ${title}. You’re confirmed.`)).toBeVisible()
      await second.goto(new URL('/?view=accounts', event).href)
      await expect(second.getByRole('heading', { name: 'Access restricted' })).toBeVisible()
      const roster = new URL(event)
      roster.searchParams.set('view','rosters')
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
