import { expect, test } from '@playwright/test'

test('uses fresh script nonces and renders the sign-in form with an enforced CSP', async ({ page, request }) => {
  await page.addInitScript(() => {
    window.cspViolations = []
    document.addEventListener('securitypolicyviolation', event => window.cspViolations.push(event.effectiveDirective))
  })

  const response = await page.goto('/?view=login')
  const policy = await response.headerValue('content-security-policy')
  const nonce = policy?.match(/script-src 'nonce-([^']+)' 'strict-dynamic'/)?.[1]
  expect(nonce).toBeTruthy()
  expect(policy).not.toContain('unsafe-inline')
  expect(policy).not.toContain('unsafe-eval')
  expect(policy).toContain("frame-ancestors 'none'")
  expect(await response.headerValue('cache-control')).toContain('no-store')
  expect(await page.locator('script').evaluateAll(scripts => [...new Set(scripts.map(script => script.nonce))])).toEqual([nonce])

  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.cspViolations)).toEqual([])

  const second = await request.get('/?view=login')
  const nextNonce = second.headers()['content-security-policy']?.match(/script-src 'nonce-([^']+)'/)?.[1]
  expect(nextNonce).toBeTruthy()
  expect(nextNonce).not.toBe(nonce)

  const missing = await request.get('/missing-page')
  expect(missing.status()).toBe(404)
  expect(missing.headers()['content-security-policy']).toContain("frame-ancestors 'none'")
})
