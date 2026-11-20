import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const publicPages = [
  { name: 'event directory', url: '/', heading: 'Upcoming events' },
  { name: 'sign-in', url: '/?view=login', heading: 'Sign in' },
  { name: 'signup', url: '/?view=signup', heading: 'Create an account' }
]

for (const width of [360, 1280]) {
  test.describe(`public accessibility at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    for (const { name, url, heading } of publicPages) {
      test(`${name} has no detected WCAG A or AA violations`, async ({ page }) => {
        await page.goto(url)
        await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
        const result = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
        expect(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))).toEqual([])
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      })
    }
  })
}

test('the keyboard skip link moves focus to the main content', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
})
