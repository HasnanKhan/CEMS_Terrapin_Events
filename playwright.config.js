import { defineConfig } from '@playwright/test'

const database = new URL(process.env.TEST_DATABASE_URL ?? 'file:///')
if (!['postgres:', 'postgresql:'].includes(database.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(database.hostname)) {
  throw new Error('Set TEST_DATABASE_URL to an isolated PostgreSQL database on localhost.')
}

const runtimeDatabase = new URL(process.env.TEST_RUNTIME_DATABASE_URL ?? database.href)
if (runtimeDatabase.protocol !== database.protocol ||
    runtimeDatabase.host !== database.host || runtimeDatabase.pathname !== database.pathname) {
  throw new Error('TEST_RUNTIME_DATABASE_URL must target the same isolated test database.')
}

const springCatalog = process.env.TEST_SPRING_CATALOG_URL ?? ''
if (springCatalog) {
  const origin = new URL(springCatalog)
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
    || origin.href !== origin.origin + '/') {
    throw new Error('Set TEST_SPRING_CATALOG_URL to an isolated HTTP origin on localhost.')
  }
}

const baseURL = 'http://localhost:3117'
export default defineConfig({
  testDir: './tests/browser',
  timeout: 60000,
  workers: process.env.CI ? 2 : undefined,
  use: {
    baseURL,
    browserName: 'chromium',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run db:setup && npm run start -- --hostname localhost --port 3117',
    url: baseURL,
    timeout: 30000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: runtimeDatabase.href,
      DATABASE_URL_UNPOOLED: database.href,
      BOOTSTRAP_EMAIL: 'browser-coordinator@umd.edu',
      BOOTSTRAP_PASSWORD: 'BrowserCoordinatorTest1',
      SEED_DEMO: 'false',
      SELF_SIGNUP_ENABLED: 'true',
      SPRING_CATALOG_URL: springCatalog
    }
  }
})
