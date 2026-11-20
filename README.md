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

## Deploy to Vercel and Neon

1. Create a [Neon free project](https://neon.com/pricing). Copy its pooled connection string to `DATABASE_URL` in your local `.env.local`. Keep that file out of Git.
2. Set your bootstrap credentials locally and run `npm run db:setup` against Neon. Keep the bootstrap password private. Vercel only needs the database connection string.
3. Push the code to a repository your Vercel account owns. In [Vercel](https://vercel.com/new), import the repository with the **Next.js** framework preset. Add the pooled `DATABASE_URL` as a Production environment variable, then deploy. Use a separate database or database branch if you enable Preview deployments.
4. Open the resulting URL, verify that sample events are visible, then sign in and complete the registration demo above.

Vercel Hobby is intended for personal, non-commercial use and has usage limits. See [Vercel Hobby](https://vercel.com/docs/plans/hobby) and [Neon connection pooling](https://neon.com/docs/connect/connection-pooling).

## Registration consistency

Every registration, cancellation, and published capacity change locks the relevant event row in PostgreSQL before counting seats or changing the roster. A unique constraint prevents multiple active entries for the same user and event. Confirmed seat changes, FIFO promotion, and related inbox entries commit together. Session tokens are stored as hashes and expire after 30 minutes of inactivity.
