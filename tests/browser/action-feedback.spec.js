import { expect, test } from '@playwright/test'
import { signIn } from './sign-in.js'

test('sign-in and signup retries retain identity fields and clear the password', async ({ page }) => {
  const email = page.getByLabel('UMD email')
  const password = page.getByLabel('Password', { exact: true })
  const alert = page.getByRole('main').getByRole('alert')

  await page.goto('/?view=login')
  await email.fill('browser-coordinator@umd.edu')
  await password.fill('IncorrectPassword1')
  const signInButton = page.getByRole('button', { name: 'Sign in', exact: true })
  await signInButton.click()
  await expect(alert).toHaveText('Email or password is incorrect.')
  await expect(alert).toBeFocused()
  await expect(email).toHaveValue('browser-coordinator@umd.edu')
  await expect(password).toHaveValue('')
  await password.fill('BrowserCoordinatorTest1')
  await signInButton.click()
  await expect(page.getByRole('status')).toHaveText('Signed in.')

  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
  await page.goto('/?view=signup')
  const name = page.getByLabel('Full name')
  await name.fill('Browser Test Attendee')
  await email.fill('attendee@example.invalid')
  await password.fill('BrowserTestPassword1')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(alert).toContainText('@umd.edu')
  await expect(name).toHaveValue('Browser Test Attendee')
  await expect(email).toHaveValue('attendee@example.invalid')
  await expect(password).toHaveValue('')
})

test('success feedback belongs to the completed action in the current browser', async ({ browser, page }) => {
  const firstStatus = page.getByRole('main').getByRole('status')
  await page.goto('/?notice=Unverified+success+message')
  await expect(firstStatus).toHaveCount(0)

  await page.goto('/?view=login')
  await signIn(page, 'browser-coordinator@umd.edu', 'BrowserCoordinatorTest1')
  await expect(firstStatus).toHaveText('Signed in.')
  await expect(firstStatus).toBeFocused()
  const firstUrl = new URL(page.url())
  const firstReceipt = firstUrl.searchParams.get('feedback')
  expect(firstReceipt).toMatch(/^[a-f0-9]{32}$/)
  const feedbackCookie = (await page.context().cookies()).find(cookie => cookie.name === '__Host-terrapin_feedback_' + firstReceipt)
  expect(feedbackCookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' })
  expect(feedbackCookie.expires - Date.now() / 1000).toBeLessThanOrEqual(90)

  const otherBrowser = await browser.newContext()
  try {
    const otherPage = await otherBrowser.newPage()
    await otherPage.goto(firstUrl.href)
    await expect(otherPage.getByRole('main').getByRole('status')).toHaveCount(0)
  } finally {
    await otherBrowser.close()
  }

  const wrongDestination = new URL(firstUrl)
  wrongDestination.searchParams.set('view', 'my')
  await page.goto(wrongDestination.href)
  await expect(firstStatus).toHaveCount(0)

  const secondTab = await page.context().newPage()
  await secondTab.goto('/?view=login')
  await signIn(secondTab, 'browser-coordinator@umd.edu', 'BrowserCoordinatorTest1')
  await expect(secondTab.getByRole('main').getByRole('status')).toHaveText('Signed in.')
  expect(new URL(secondTab.url()).searchParams.get('feedback')).not.toBe(firstReceipt)
  await page.goto(firstUrl.href)
  await expect(firstStatus).toHaveText('Signed in.')
})
