# Controlled load verification

The harness covers SRS NFR-1 and NFR-2 server response times and NFR-4 and NFR-5 registration integrity. It launches a production build on IPv4 loopback and accepts only a local PostgreSQL database named `terrapin_load_test`. Each run creates synthetic accounts and a published event with 20 seats at the default load. The app receives ordinary same-origin requests and uses its normal database connection and registration code. Fixture rows are removed after each run.

## Results

Four runs on November 19, 2026 used 100 virtual users per run, Node.js 22.12.0, PostgreSQL 18.7, and the restricted application database login. Runs 1 through 3 used the registration experience candidate. Run 4 used the production build of commit `1a8d68f`, including the reviewed keyboard and focus fixes. The application, database, and load generator ran on the same Apple Silicon computer.

| Run | Browse p95 | Search p95 | Event detail p95 | Registration or waitlist p95 | Slowest submission |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 272 ms | 193 ms | 167 ms | 462 ms | 471 ms |
| 2 | 231 ms | 153 ms | 131 ms | 368 ms | 377 ms |
| 3 | 260 ms | 181 ms | 138 ms | 350 ms | 360 ms |
| 4 | 223 ms | 150 ms | 129 ms | 349 ms | 357 ms |
| SRS p95 target | ≤3,000 ms | ≤3,000 ms | ≤3,000 ms | ≤2,000 ms | |

Every run produced 20 confirmed and 80 waitlisted registrations. Every simulated attendee had one registration and a matching inbox entry. Each of three cancellations promoted the next attendee in registration order and wrote their promotion to the inbox. All runs completed with zero overbookings, duplicate registrations, or lost registrations.

## Repeat the run

Use a disposable local PostgreSQL instance. If you have Docker, this example starts one using the same major version as the repository CI suite.

```sh
docker run --rm --name terrapin-load-test-db -d -p 127.0.0.1:55445:5432 \
  -e POSTGRES_PASSWORD=load_test_only -e POSTGRES_DB=terrapin_load_test postgres:16
npm ci
npx playwright install chromium
npm run build
export LOAD_TEST_DATABASE_URL='postgresql://postgres:load_test_only@127.0.0.1:55445/terrapin_load_test'
node scripts/load-test.mjs
```

Run the script again to repeat the measurement. `LOAD_TEST_USERS` accepts 2 to 100 and defaults to 100. `LOAD_TEST_PORT` defaults to 3118. `LOAD_TEST_CHROMIUM_PATH` can point to an installed Chromium executable. The script exits with a nonzero status if a request or integrity check fails or a p95 target is missed.

For a repeat with the restricted runtime role, apply the schema with the test owner and provision the credentials on that same disposable database. The fixture work continues to use the owner connection.

```sh
psql "$LOAD_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/schema.sql
DATABASE_URL="$LOAD_TEST_DATABASE_URL" DATABASE_URL_UNPOOLED="$LOAD_TEST_DATABASE_URL" npm run db:provision-runtime
LOAD_TEST_RUNTIME_DATABASE_URL="$(env -u DATABASE_URL node --env-file=.env.runtime.local -p 'process.env.DATABASE_URL')" \
  node scripts/load-test.mjs
```

`db:provision-runtime` creates `.env.runtime.local` and requires that the file and role are both absent. Use a fresh checkout and local database instance if those names are in use. Stop the disposable container with `docker stop terrapin-load-test-db` after recording the results.

## Measurement scope

Each read phase warms its route, then issues 100 concurrent requests before proceeding to the next phase. The script measures full HTTP response bodies and uses the nearest-rank p95. The registration phase preloads the authenticated forms and then measures 100 concurrent submissions for one event, including the redirect and resulting HTML response. Chromium parses the rendered form fields before timing starts. Login, browser rendering and hydration, asset downloads, geographic latency, cold starts, and sustained traffic remain outside this measurement. Hosted Vercel and Neon performance requires a separate nonproduction run.
