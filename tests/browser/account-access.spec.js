import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import pg from 'pg'
import { hashPassword } from '../../lib/password.js'
import { testDatabase } from '../support/database.js'
import { signIn } from './sign-in.js'

test.describe('access changes for a signed-in attendee', () => {
  test('role grants and removals apply to the current session, and deactivation revokes it', async ({ browser, page, baseURL }) => {
    const fixtures = new pg.Pool({ connectionString: testDatabase().href })
    const attendee = await browser.newContext({ baseURL })
    const email = `browser-access-${randomUUID()}@umd.edu`
    const password = 'BrowserPermissionTest1'
    let accountId
    try {
      const { rows: [account] } = await fixtures.query("insert into accounts(name,email,password_hash) values('Access Test',$1,$2) returning id",
        [email, await hashPassword(password)])
      accountId = account.id
      const participant = await attendee.newPage()
      await participant.goto('/?view=login')
      await signIn(participant, email, password)
      await participant.goto('/?view=organize')
      await expect(participant.getByRole('heading', { name: 'Access restricted' })).toBeVisible()

      await page.goto('/?view=login')
      await signIn(page, 'browser-coordinator@umd.edu', 'BrowserCoordinatorTest1')

      async function saveAccess({ organizer, active }) {
        await page.goto('/?view=accounts')
        const card = page.locator('.account-grid section').filter({ hasText: email })
        await card.getByLabel('Organizer', { exact: true }).setChecked(organizer)
        await card.getByLabel('Active account').setChecked(active)
        await card.getByRole('button', { name: 'Save account' }).click()
        await expect(page.getByRole('status')).toHaveText('Account updated.')
      }

      await test.step('a role grant takes effect on the next request', async () => {
        await saveAccess({ organizer: true, active: true })
        await participant.goto('/?view=organize')
        await expect(participant.getByRole('heading', { name: 'Organizer workspace' })).toBeVisible()
      })

      await test.step('role removal blocks organizer access but preserves attendee access', async () => {
        await saveAccess({ organizer: false, active: true })
        await participant.reload()
        await expect(participant.getByRole('heading', { name: 'Access restricted' })).toBeVisible()
        await participant.goto('/?view=my')
        await expect(participant.getByRole('heading', { name: 'My events' })).toBeVisible()
      })

      await test.step('deactivation invalidates the existing session', async () => {
        await saveAccess({ organizer: false, active: false })
        await participant.reload()
        await expect(participant.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
        const sessions = await fixtures.query('select 1 from sessions where account_id=$1', [accountId])
        expect(sessions.rowCount).toBe(0)
      })
    } finally {
      try {
        await attendee.close()
        if (accountId) {
          await fixtures.query(`delete from audit_entries where actor_id=$1 or
            (target=$1::int::text and action in ('role_change','account_deactivation'))`, [accountId])
          await fixtures.query('delete from accounts where id=$1', [accountId])
        }
      } finally {
        await fixtures.end()
      }
    }
  })
})
