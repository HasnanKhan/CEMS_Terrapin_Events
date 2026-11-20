# Terrapin Events

Terrapin Events is a University of Maryland course demo with public event browsing, a coordinator approval workflow, and capacity-limited registration backed by PostgreSQL.

## MVP

- Guests can search upcoming published events, filter by category and venue, and view venue, time, capacity, and registration deadlines.
- Attendees can create a demo account, register, join a waitlist, cancel, and see their position and simulated notifications.
- Organizers can create and edit drafts, submit up to five events for approval, view their rosters, and update published capacity.
- Administrators can filter the oldest-first approval queue by organizer, publish events, and view published rosters.
- System administrators can grant roles and activate or deactivate accounts. The database records sign-in attempts, lockouts, access denials, account changes, and approvals.

The SRS prototype boundary drives feature scope. The implementation uses a React frontend and a PostgreSQL system of record as described in the SAD and SADD. Next.js server actions and Vercel Functions replace Spring Boot, Nginx, and Docker for the hosted app. Notifications are delivered inside the app. University SSO, external notifications, calendar month and week views, scheduling conflicts, rejection and resubmission, check-in, and reporting are outside this demo. Demo sign-up validates the email domain without verifying mailbox ownership. Use fictional data only.

## Run locally

Use Node.js 22 and a PostgreSQL database. For a local database with Docker:

```sh
docker run --name terrapin-postgres -d -p 127.0.0.1:5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=terrapin postgres:16
npm ci
cp .env.example .env.local
```

In `.env.local`, set `DATABASE_URL` for your database and choose a fictional `BOOTSTRAP_EMAIL` ending in `@umd.edu`. Set a unique `BOOTSTRAP_PASSWORD` of 12–128 characters with at least one letter and one number. Set `SEED_DEMO=true` on the first setup to add four upcoming sample events. The bootstrap account has all four roles. Existing accounts are preserved on repeated setup runs.

```sh
npm run db:setup
npm run dev
```

Open [localhost:3000](http://localhost:3000). Sign in with the bootstrap account to create an event and approve it from **Approvals**. To demo the waitlist, use **Build Night at Iribe** and three fictional attendee accounts. Register all three, cancel one confirmed registration, then check the third account’s **My events** and **Inbox** for the promotion.

## Use a Neon database locally

With a Neon project already linked to this checkout, run `npx neon@latest deploy` to apply [neon.ts](neon.ts) and pull the connection strings locally. Alternatively, copy the pooled Neon string into `DATABASE_URL` in `.env.local` and the direct string into `DATABASE_URL_UNPOOLED`. Keep both values private. The server uses the pooled connection for regular requests and `npm run db:setup` uses the direct connection when supplied. Set the optional bootstrap variables for demo data, then run `npm run db:setup` and `npm run dev`.

## Deploy to Vercel and Neon

1. Create a [Neon free project](https://neon.com/pricing). Copy its pooled string to `DATABASE_URL` and its direct string to `DATABASE_URL_UNPOOLED` in your local `.env.local`. Keep that file out of Git.
2. Set your bootstrap credentials locally and run `npm run db:setup` against Neon. Keep the bootstrap password private. Vercel only needs the database connection string.
3. Push the code to a repository your Vercel account owns. In [Vercel](https://vercel.com/new), import the repository with the **Next.js** framework preset. Add the pooled `DATABASE_URL` as a Production environment variable, then deploy. Use a separate database or database branch if you enable Preview deployments.
4. Open the resulting URL, verify that sample events are visible, then sign in and complete the registration demo above.

Vercel Hobby is intended for personal, non-commercial use and has usage limits. See [Vercel Hobby](https://vercel.com/docs/plans/hobby) and [Neon connection pooling](https://neon.com/docs/connect/connection-pooling).

## Database runtime role

The schema owner applies migrations through the direct `DATABASE_URL_UNPOOLED` connection. Configure the app to use a separate `terrapin_runtime` login with explicit grants in [runtime-grants.sql](lib/runtime-grants.sql). It can write audit entries and cannot read, update, delete, or truncate them or create objects in the public schema.

After initializing the target database, run `npm run db:provision-runtime` once from a checkout configured with the schema-owner direct and pooled URLs. This creates the restricted role and writes its pooled connection string to the ignored `.env.runtime.local` file with owner-only permissions. The command refuses to replace an existing credential file or login. Verify the restricted role against an isolated database before setting the Vercel Production `DATABASE_URL` to its pooled URL. Keep the direct owner connection out of Vercel. The old deployment can continue to use its existing connection until the verified cutover.

To exercise the split locally, set `TEST_DATABASE_URL` to an isolated local schema-owner connection and `TEST_RUNTIME_DATABASE_URL` to the restricted connection for that same database. Run `npm run test:browser`. Fixtures and schema setup use the test owner and the app uses the restricted role.

## Request limits

The app accepts up to five signup attempts and 20 sign-in attempts per client IP and 10 combined registration or cancellation attempts per account in a rolling minute. Vercel supplies the trusted client IP. Local requests and deployments without a trusted IP share a fallback sign-in bucket. Apply schema changes with `npm run db:setup` before deploying a version that uses the request limits. Set `SELF_SIGNUP_ENABLED=false` on Vercel and redeploy to pause public account creation while existing users continue to sign in. Demo signup checks email format only. Use a verified identity provider before collecting real university records.

## Security audit retention

The app records sign-ins, account lockouts, authorization denials, rate-limit denials, role and activation changes, and event approvals in PostgreSQL. Vercel supplies the validated source IP when available. The app has no audit deletion or retention job. When operating the demo, retain the audit table and its backups for at least one year, including when replacing the Neon database. Verify the retention and restore procedure as part of release testing.

## Registration consistency

Every registration, cancellation, and published capacity change locks the relevant event row in PostgreSQL before counting seats or changing the roster. A unique constraint prevents multiple active entries for the same user and event. Confirmed seat changes, FIFO promotion, and related inbox entries commit together. Session tokens are stored as hashes. Sessions expire after 30 minutes of inactivity or 12 hours after sign-in, whichever comes first. Existing sessions retain their current expiry when the cap is first deployed. Apply the schema with `npm run db:setup` before deploying the session policy.

## Prototype verification

Run `npm test` for the unit checks. For the full suite, set `TEST_DATABASE_URL` to a dedicated PostgreSQL database on localhost. Load the schema before running coverage:

```sh
psql "$TEST_DATABASE_URL" -f lib/schema.sql
npm run test:coverage
```

Integration tests skip when `TEST_DATABASE_URL` is absent and reject remote hosts. The coverage command requires at least 80% statement coverage in every file under `lib/*.js`. That report covers the backend prototype modules. It does not measure Next.js pages, deployment, accessibility, or load behavior.

The [verification record](docs/prototype-verification.md) links prototype requirements to their evidence, lists open acceptance checks, and maps the documented design to the implemented components.

GitHub Actions checks the dependency audit, runs the backend tests and coverage gate against a disposable PostgreSQL service, builds the app, and runs Chromium. Failed browser runs keep their traces for seven days. Named behavior specs cover input validation and PostgreSQL business rules. Chromium covers draft approval, signup, waitlist promotion, role changes in an active session, and deactivation. Axe checks public pages at 360 px and 1280 px. Manual accessibility review still applies. To run it locally, keep `TEST_DATABASE_URL` pointed at a dedicated localhost test database. The browser suite creates temporary demo accounts and events in that database.

```sh
npx playwright install chromium
npm run build
npm run test:browser
```

## Production readiness audit

The deployed application uses HTTPS and serves dynamic pages with no shared caching. The last production smoke test verified signup, sign-in, registration, cancellation, and inbox delivery against Neon. GitHub Actions verifies the app against PostgreSQL and Chromium. The dependency audit found no known vulnerabilities at the time of review.

For a demo, use fictional records. The public signup controls and browser isolation headers reduce exposure, and `GET /api/health` checks database connectivity. Readiness returns HTTP 200 with `{"status":"ok"}` or HTTP 503 with `{"status":"unavailable"}`. Point an uptime monitor at this endpoint and route alerts to the maintainer. Choose a cadence consistent with the database compute budget, since probes can keep a sleeping database awake.

Before a pilot with real users:

| Priority | Open item | Acceptance evidence |
| --- | --- | --- |
| Release gate | Verified identity and administrator MFA | Use an approved university identity provider, define role assignment and recovery, and test both access grants and revocation. Treat existing demo accounts as unverified. |
| Release gate | Student data and audit policy | Establish approved data collection, roster access, privacy notice, deletion process, and audit retention. Keep real data in an approved environment. |
| Release gate | Incident response and recovery | Assign alert ownership, verify monitoring and error alert delivery, and rehearse restoring into an isolated database. Record recovery time and data loss. |
| High | Release controls | Protect `main` when the repository plan permits it, require passing CI and an independent reviewer, and keep preview data separate from production. The audited repository did not protect `main`. |
| High | Accessibility and capacity | Run WCAG 2.1 AA checks with keyboard and assistive technology. Use a staging database to measure the documented concurrency and latency targets. |
| High | Script security policy | Trial a nonce-based script policy in report-only mode and verify hydration, authentication, and any identity-provider callbacks before enforcing it. |
