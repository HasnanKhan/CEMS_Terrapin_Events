import { expect, test } from '@playwright/test'
import pg from 'pg'
import { testDatabase } from '../support/database.js'

const outage = process.env.TEST_SPRING_CATALOG_OUTAGE === '1'
test.skip(!process.env.TEST_SPRING_CATALOG_URL, 'Requires an isolated Spring catalog fixture')
test.use({ viewport: { width: 360, height: 800 }, javaScriptEnabled: false })

test('filters and pages through results served by the Spring catalog', async ({ page }) => {
  test.skip(outage, 'Spring is stopped for the outage check')
  const db = new pg.Client({ connectionString: testDatabase().href })
  await db.connect()
  try {
    const { rows: [result] } = await db.query("select exists(select 1 from events where title = 'Spring fair %_ 13') as present")
    expect(result.present).toBe(false)
  } finally {
    await db.end()
  }

  await page.goto('/?q=' + encodeURIComponent('Spring fair %_') + '&category=Academic')
  const venue = page.getByRole('combobox', { name: 'Venue' })
  await venue.selectOption({ label: 'Catalog fixture hall' })
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(12)
  await expect(page.getByText('Waitlist available', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Next', exact: true }).click()
  await expect(page.getByText('Page 2', { exact: true })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Spring fair %_ 13', exact: true })).toBeVisible()
  await expect(venue).toHaveValue('810001')
  await expect(page.getByRole('searchbox', { name: 'Search events' })).toHaveValue('Spring fair %_')
})

test('shows an unavailable directory when the configured Spring API is down', async ({ page }) => {
  test.skip(!outage, 'Spring is running for the normal integration check')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Event directory temporarily unavailable' })).toBeVisible()
  await expect(page.getByRole('searchbox', { name: 'Search events' })).toHaveCount(0)
  await expect(page.getByText(/127\.0\.0\.1|ECONNREFUSED/)).toHaveCount(0)
})
