import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import pg from 'pg'
import { testDatabase } from '../support/database.js'

test.use({ viewport: { width: 360, height: 800 }, javaScriptEnabled: false })

test('mobile search keeps filters through pagination, event details, and empty results', async ({ page }) => {
  const marker = 'Directory ' + randomUUID()
  const db = new pg.Client({ connectionString: testDatabase().href })
  await db.connect()
  try {
    const { rows: [venue] } = await db.query("select id from venues where name='Iribe Center'")
    await db.query(`insert into events (owner_id,venue_id,title,description,category,host,starts_at,ends_at,deadline,capacity,status)
      select a.id,$1,$2 || ' ' || n,'Directory test fixture','Technology','Browser Test',
        now()+interval '2 days'+n*interval '1 hour',now()+interval '2 days'+(n+1)*interval '1 hour',
        now()+interval '1 day',20,case when n=14 then 'draft' else 'published' end
      from accounts a cross join generate_series(1,14) n where a.email='browser-coordinator@umd.edu'`, [venue.id, marker])
    const title = name => page.getByRole('heading', { name, exact: true })
    const search = page.getByRole('searchbox', { name: 'Search events' })
    const category = page.getByRole('combobox', { name: 'Category' })
    const venueSelect = page.getByRole('combobox', { name: 'Venue' })

    await page.goto('/')
    await expect(page).toHaveTitle('Explore campus events | Terrapin Events')
    await page.getByRole('link', { name: 'Explore events', exact: true }).press('Enter')
    await expect(title('Upcoming events')).toBeFocused()
    await search.fill(marker)
    await category.selectOption('Technology')
    await venueSelect.selectOption({ label: 'Iribe Center' })
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page.getByRole('article')).toHaveCount(12)
    await expect(page.getByRole('link', { name: 'Explore events', exact: true })).toHaveCount(0)
    await page.getByRole('link', { name: 'Next', exact: true }).click()
    await expect(page.getByText('Page 2', { exact: true })).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(1)
    await page.getByRole('link', { name: marker + ' 13', exact: true }).click()
    await expect(page).toHaveTitle('Event details | Terrapin Events')
    await expect(title(marker + ' 13')).toBeVisible()
    await page.getByRole('link', { name: 'Back to results', exact: true }).click()
    await expect(page.getByText('Page 2', { exact: true })).toBeVisible()
    await expect(search).toHaveValue(marker)
    await expect(category).toHaveValue('Technology')
    await expect(venueSelect).toHaveValue(String(venue.id))
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)

    const emptyPage = new URL(page.url())
    emptyPage.searchParams.set('page', '3')
    await page.goto(emptyPage.href)
    await expect(title('No events found')).toBeVisible()
    await page.getByRole('link', { name: 'Return to the first page of results', exact: true }).click()
    await expect(page.getByRole('article')).toHaveCount(12)
    await expect(search).toHaveValue(marker)
    await page.getByRole('link', { name: 'Clear filters', exact: true }).click()
    await expect(search).toHaveValue('')
    await expect(category).toHaveValue('')
    await expect(venueSelect).toHaveValue('')
  } finally {
    try {
      await db.query('delete from events where starts_at>now() and title like $1', [marker + ' %'])
    } finally {
      await db.end()
    }
  }
})
