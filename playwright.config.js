import { defineConfig } from '@playwright/test'
import { testDatabase } from './tests/support/database.js'

const database = testDatabase()
const runtimeDatabase = testDatabase(process.env.TEST_RUNTIME_DATABASE_URL ?? database.href, 'TEST_RUNTIME_DATABASE_URL')
if (runtimeDatabase.protocol !== database.protocol ||
    runtimeDatabase.host !== database.host || runtimeDatabase.pathname !== database.pathname) {
  throw new Error('TEST_RUNTIME_DATABASE_URL must target the same isolated test database.')
}

function testSpringOrigin(key) {
  const value = process.env[key] ?? ''
  if (!value) return ''
  const origin = new URL(value)
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
    || origin.href !== origin.origin + '/') {
    throw new Error(`Set ${key} to an isolated HTTP origin on localhost.`)
  }
  return origin.origin
}

const springCatalog = testSpringOrigin('TEST_SPRING_CATALOG_URL')
const springSession = testSpringOrigin('TEST_SPRING_SESSION_URL')
const springSessionToken = process.env.TEST_SPRING_SESSION_SERVICE_TOKEN ?? ''
if (Boolean(springSession) !== Boolean(springSessionToken) || (springSessionToken && !/^[a-f0-9]{64}$/.test(springSessionToken))) {
  throw new Error('Set both TEST_SPRING_SESSION_URL and a 64-character hexadecimal TEST_SPRING_SESSION_SERVICE_TOKEN.')
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
      SPRING_CATALOG_URL: springCatalog,
      SPRING_SESSION_URL: springSession,
      SPRING_SESSION_SERVICE_TOKEN: springSessionToken
    }
  }
})
