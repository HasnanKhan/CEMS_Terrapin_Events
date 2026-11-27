# Terrapin Events

Terrapin Events is a University of Maryland course prototype for discovering, approving, and registering for campus events. The [live demo](https://cemsterrapinevents.vercel.app) runs Next.js on Vercel with PostgreSQL on Neon. Use fictional accounts and events.

[Run locally](#run-locally) · [Try Spring Boot](#spring-boot-staging) · [Run tests](#prototype-verification) · [Deploy](#deploy-to-vercel-and-neon)

## Run locally

You need Node.js 22 and a PostgreSQL database. If you already have PostgreSQL, use its connection URL. To start a local database with Docker, run the following once.

```sh
docker run --name terrapin-postgres -d -p 127.0.0.1:5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=terrapin postgres:16
```

From the repo root, install dependencies and create your local settings file.

```sh
npm ci
test -f .env.local || cp .env.example .env.local
```

Set these values in `.env.local`. Keep the file private.

| Setting | What to use |
| --- | --- |
| `DATABASE_URL` | Your PostgreSQL connection string. The example file uses the Docker settings above. |
| `BOOTSTRAP_EMAIL` | A fictional address ending in `@umd.edu`. |
| `BOOTSTRAP_PASSWORD` | A unique 12–128 character password with a letter and a number. |
| `SEED_DEMO` | Set to `true` on first setup to add four sample events. |

```sh
npm run db:setup
npm run dev
```

Open [localhost:3000](http://localhost:3000). The bootstrap account has all four roles. Rerunning setup preserves existing accounts.

### Try the demo

1. Sign in with the bootstrap account. Create a draft as an organizer, submit it, then publish it from **Approvals**.
2. Register three fictional attendee accounts for the seeded **Build Night at Iribe** event. The first two get seats and the third joins the waitlist.
3. Cancel one confirmed registration. Check the third account’s **My events** and **Inbox** for the promotion.

### Use a Neon database locally

Use a dedicated Neon database or branch for development. Copy the pooled connection URL into `DATABASE_URL` and the direct URL into `DATABASE_URL_UNPOOLED`, then run the same setup and start commands. With an already linked Neon project, `npx neon@latest deploy` can apply [the project configuration](neon.ts) and pull the local connection URLs. Run that command against the intended development project.

## What the prototype covers

| Role | Available workflows |
| --- | --- |
| Guest | Browse published events, search by keyword, and filter by category or venue. |
| Attendee | Create a demo account, register, join or leave a waitlist, cancel, and view notices in the inbox. |
| Organizer | Create drafts, submit up to five pending events, view their rosters, and update published event capacity. |
| Administrator | Filter the oldest-first approval queue, publish events, and view event rosters. |
| System administrator | Grant roles and activate or deactivate accounts. Security and administrative actions are recorded in PostgreSQL. |

The prototype uses in-app notifications and sample venues. The [requirements and conformance record](docs/prototype-verification.md) identifies full-system features and open acceptance checks. Demo signup checks email format and domain. A real-user pilot needs verified identities.

## Spring Boot staging

The [Java 21 and Spring Boot setup](backend/README.md) runs a separate read-only catalog API. In local or staging Next.js, `SPRING_CATALOG_URL` switches Explore’s listing and venue filters to that API. Start both services against the same staging database, with separate runtime roles. Staging can also opt into [Spring session resolution](backend/README.md#stage-session-resolution). Production currently uses Next.js for its workflows and database reads.

## Prototype verification

| Command | What it checks |
| --- | --- |
| `npm test` | Node tests, with database cases enabled when `TEST_DATABASE_URL` is set. |
| `npm run test:unit-coverage` | At least 80% statement coverage per file for the input and password modules using unit tests alone. |
| `npm run test:coverage` | At least 80% statement coverage per file under `lib/` across the Node suite. |
| `npm run test:browser` | Chromium workflows and axe checks on public pages at phone and desktop widths. |
| `./mvnw clean verify` from `backend` | Spring and PostgreSQL integration tests and an 80% Java line coverage gate using the [Spring test fixtures](backend/README.md#verify). |

For the full Node and browser suites, install the PostgreSQL command-line client (`psql`) and set `TEST_DATABASE_URL` to a plain URL for a disposable local database. To exercise the restricted Next.js role, also set `TEST_RUNTIME_DATABASE_URL` to its connection for the same database.

```sh
psql "${TEST_DATABASE_URL:?Set a disposable local fixture database URL}" -v ON_ERROR_STOP=1 -f lib/schema.sql
npm run test:coverage
npx playwright install chromium
npm run build
npm run test:browser
```

GitHub Actions runs [the Next.js checks](.github/workflows/tests.yml) and [the Spring checks](.github/workflows/spring-backend.yml). Spring CI exercises catalog reads, the shared-database registration journey, and the outage view. Failed browser runs retain traces for seven days. See the [load results](docs/load-verification.md) and [security and recovery record](docs/recovery-verification.md) for acceptance evidence.

### Registration and roster API

Use a signed-in fictional account's `terrapin_session` cookie in Postman. For registration and cancellation, set `Origin` to the exact base URL of the app, including its scheme and any nondefault port. Use the event ID from the app's event link to register and the registration ID from the HTTP 201 response to cancel.

| Method and path | Role and result |
| --- | --- |
| `POST /api/events/{id}/registrations` | An attendee can register with an empty body. HTTP 201 returns the registration ID, status, and position for waitlisted attendees. |
| `DELETE /api/registrations/{id}` | An attendee can cancel their own confirmed or waitlisted entry before the event starts. HTTP 200 returns the registration ID and its `cancelled` status. |
| `GET /api/events/{id}/roster` | The owning organizer or an administrator can read the event summary and active roster. |

Errors use the SADD JSON fields `timestamp`, `status`, `code`, `message`, `path`, and `fieldErrors`. An unpublished or closed event returns the generic registration-closed error with HTTP 422. The [API acceptance tests](tests/browser/mvp-api.spec.js) run against a disposable database.

## Deploy to Vercel and Neon

1. Prepare a Neon database for the demo. Keep its owner URLs in your local settings and apply the schema with `npm run db:setup`.
2. Provision the [restricted runtime role](#database-runtime-role) and verify it on an isolated database.
3. Import the repo into [Vercel](https://vercel.com/new) using the Next.js preset. Set Production `DATABASE_URL` to the restricted pooled URL, then deploy. Use a separate database or branch for Preview deployments.
4. Check `/api/health` and run the demo journey with fictional records.

Review the [Vercel plan limits](https://vercel.com/docs/plans/hobby) and [Neon pooling guidance](https://neon.com/docs/connect/connection-pooling) for hosted deployments.

### Database runtime role

Run `npm run db:provision-runtime` once after schema setup. It uses the locally configured owner URLs and writes the restricted pooled URL to the ignored `.env.runtime.local` file. The command requires a new role and credential file. Keep the schema owner’s direct URL in your maintenance environment.

The Next.js `terrapin_runtime` login can append audit records. Audit reads and mutations and schema creation are denied. Apply [the role grants](lib/runtime-grants.sql) as the database owner.

For an existing deployment, apply the schema and the updated registration grants to each environment before releasing the new registration code. The migration preserves existing rows. Revoke the runtime role's old `DELETE` grant on `public.registrations` before making the new deployment available. This briefly pauses cancellations on the old deployment and protects cancellation history throughout the cutover. Use a release that supports retained cancellations for any subsequent rollback.

## Operations and release readiness

- **Sessions.** Session tokens are stored as hashes. A session expires after 30 minutes idle or 12 hours since sign-in. Apply schema updates before deploying.
- **Request limits.** Limits per rolling minute are five signup attempts and 20 sign-in attempts per trusted Vercel client IP, plus 10 registration or cancellation attempts per account. Requests without a trusted IP share a fallback bucket. Set `SELF_SIGNUP_ENABLED=false` and redeploy to pause public signup.
- **Registration integrity.** Registration, cancellation, and capacity changes use the same PostgreSQL event row lock with a 1.5-second timeout. Cancellation retains its row and timestamp. Seat changes, waitlist promotions, and inbox records commit together.
- **Daily cleanup.** Set a random server-only `CRON_SECRET` in the Vercel Production environment before deploying. Vercel calls the cleanup route once a day during the 09:00 UTC hour. Each call removes up to 1,000 expired sessions and 1,000 rate-limit counters inactive for over an hour. Verify the first successful invocation in the Vercel logs. [Vercel cron setup](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- **Audit and recovery.** Retain audit history for at least a year and monitor daily backups. Record restore time and data loss from an isolated restore drill.
- **Readiness.** Next.js `GET /api/health` returns HTTP 200 when it can reach PostgreSQL and HTTP 503 when it cannot. Staging Spring readiness is checked separately. Set a monitoring interval that fits the database compute budget.
- **Release checks.** Pull requests into `main` require the PostgreSQL and Chromium check and the Java 21 and PostgreSQL check. The [GitHub ruleset definition](.github/main-release-ruleset.json) records the required jobs and branch protections. Preview deploys use the separate `pr-preview` Neon branch with a restricted runtime login. Apply Preview schema changes from a maintenance environment.
- **Browser policy.** Each rendered application view receives a fresh script nonce. Static error responses keep a baseline policy. Test sign-in and event workflows after changes to hydration, scripts, or styles.

For a pilot with real users, establish verified identity and admin MFA, approved student data and audit handling, monitored backups and incident ownership. Verify screen-reader accessibility and hosted capacity before rollout. The [conformance record](docs/prototype-verification.md) tracks these findings and the remaining architecture work.
