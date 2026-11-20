import { expect } from '@playwright/test'

export async function signIn(page, email, password) {
  await page.getByLabel('UMD email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Signed in.')
}
