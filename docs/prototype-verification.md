# Prototype verification record

This record covers the SRS prototype scope and the evidence needed for course submission. It tracks implementation separately from acceptance evidence so that a passing workflow cannot stand in for a requirement's full acceptance criteria.

## Test plan and evidence

Run tests against an isolated local or CI PostgreSQL instance populated only with synthetic records. Use the commands in the [README](../README.md#prototype-verification). GitHub Actions saves the PostgreSQL, coverage, build, and Chromium results for each PR and push to main. Attach a passing run for the submitted commit to the course evidence package.

- Unit tests exercise password handling, client IP handling, and the readiness error response.
- PostgreSQL integration tests exercise access control, persisted event state, audit entries, concurrent registration, waitlist ordering, and notification writes.
- Chromium checks the organizer, administrator, attendee, and guest flows through the built application.
- Acceptance checks measure response times and first-time usability, verify accessibility and application security, and rehearse recovery. Record the environment, run date, observed result, and linked evidence for each check.

## Functional requirements

Test links identify where the evidence lives. **Partial evidence** means the test covers a subset of the requirement's acceptance criteria. **Prototype subset** records an explicit scope limit in SRS Section 3.1.

| SRS ID | Evidence | Status |
| --- | --- | --- |
| FR-1 | Browser signup with name, email, and password. [Chromium workflow](../tests/browser/mvp.spec.js) | Verified |
| FR-2 | Invalid domain and duplicate email are rejected with a reason. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-3 | Password-rule boundaries and signup rejection are tested. [Validation specs](../tests/input.test.js) · [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-4 | Incorrect login fails and correct login creates a readable session. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-5 | Five failed attempts set a 15-minute lock. An expired lock permits another attempt. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-6 | Sessions start with a 30-minute idle expiry and an additional 12-hour cap. Tests exercise sign-out, idle expiry, and the absolute cap. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-7 | New accounts receive only the Attendee role. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-8 | Grant and removal of Organizer access take effect in an active session. Deactivation invalidates the session, and reactivation is tested. [Browser access specs](../tests/browser/account-access.spec.js) · [PostgreSQL workflows](../tests/prototype.test.js) | Partial evidence for all role combinations |
| FR-9 | Role denial, organizer ownership, and guest and attendee roster restrictions are exercised. [PostgreSQL workflows](../tests/prototype.test.js) · [Chromium workflow](../tests/browser/mvp.spec.js) | Partial evidence for every protected operation |
| FR-11 | Organizer creates a draft with the required event fields. [Chromium workflow](../tests/browser/mvp.spec.js) | Verified |
| FR-12 | Missing title, invalid date, excessive venue capacity, and deadline after start are rejected. [PostgreSQL workflows](../tests/prototype.test.js) | Partial evidence for all input boundaries |
| FR-13 | Organizer saves and edits a draft before submission. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-14 | Six simultaneous submissions admit five and leave the sixth in draft. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-15 | Approval queue orders submissions oldest first and filters by organizer. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-16 | Administrator publishes a pending event and the event accepts registrations. [Chromium workflow](../tests/browser/mvp.spec.js) | Verified |
| FR-21 | Published event appears in the public list. [Chromium workflow](../tests/browser/mvp.spec.js) | Prototype subset, list view |
| FR-24 | Event detail is rendered and registration behavior reflects remaining capacity. [Chromium workflow](../tests/browser/mvp.spec.js) | Partial evidence for every displayed field and count |
| FR-25 | Draft is hidden from a guest and the published event appears in public search. [Chromium workflow](../tests/browser/mvp.spec.js) | Partial evidence for the visibility matrix. Completed and Cancelled lifecycle transitions are outside this prototype. |
| FR-26 | An attendee confirms a seat for a published event before its deadline. [Chromium workflow](../tests/browser/mvp.spec.js) | Verified |
| FR-27 | Concurrent registration for one seat yields one confirmation and two waitlist entries. [PostgreSQL workflows](../tests/prototype.test.js) | Verified in the isolated concurrency case |
| FR-28 | Duplicate confirmed and waitlist entries are rejected. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-29 | Full event accepts a waitlist entry and stores each member’s join timestamp. [Chromium workflow](../tests/browser/mvp.spec.js) · [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-30 | Waitlist positions are assigned and the next position updates after promotion. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-31 | Confirmed and waitlist cancellation work before the event. Browser coverage checks explicit confirmation, cancellation after registration closes, and the disabled action on past events. [Chromium workflow](../tests/browser/mvp.spec.js) · [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-32 | Cancelling a confirmed seat promotes the first waitlisted attendee. [PostgreSQL workflows](../tests/prototype.test.js) · [Chromium workflow](../tests/browser/mvp.spec.js) | Verified |
| FR-33 | Registration after the deadline and for draft and pending events is rejected. [PostgreSQL workflows](../tests/prototype.test.js) | Verified for the prototype states |
| FR-34 | Capacity increase promotes a waitlisted attendee. Changes exceeding venue capacity or falling below the confirmed count are rejected. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-35 | Administrator can open a draft, pending, or published roster. Organizers are restricted to their own events. Guests and other users are denied. [PostgreSQL workflows](../tests/prototype.test.js) · [Chromium workflow](../tests/browser/mvp.spec.js) | Verified for authorization and roster contents used by the test |
| FR-37 | My Events shows current status and waitlist position, groups past events, and explains the cancellation cutoff. [Chromium workflow](../tests/browser/mvp.spec.js) | Verified for the browser scenarios |
| FR-39 | Registration creates a confirmation entry. [PostgreSQL workflows](../tests/prototype.test.js) | Verified for simulated delivery |
| FR-40 | Joining and promotion create inbox entries. The promotion is visible in Chromium. [PostgreSQL workflows](../tests/prototype.test.js) · [Chromium workflow](../tests/browser/mvp.spec.js) | Partial evidence for the exact join message contents |
| FR-45 | Promotion appears in the recipient's inbox. The database records recipient, type, creation time, and delivery time. [Schema](../lib/schema.sql) · [Chromium workflow](../tests/browser/mvp.spec.js) | Partial evidence for timestamps and inbox isolation |
| FR-46 | Catalog seeded with sample venues. [Schema](../lib/schema.sql) | Prototype subset, sample data |
| FR-48 | Organizer selects a venue in the event form. [Chromium workflow](../tests/browser/mvp.spec.js) | Prototype subset, venue selection |
| FR-52 | Draft capacity above the venue limit is rejected. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-62 | Audit tests check account and roster actions, allowed and denied outcomes, and trusted source IP attribution. [PostgreSQL workflows](../tests/prototype.test.js) | Prototype subset, partial evidence for the full audit matrix |

Rejection, resubmission, published event cancellation and completion, month and week calendars, resource management, check-in, reporting, and live notification delivery are full-system work. Keyword search is available in the deployed prototype as an enhancement.

## Nonfunctional requirements

| SRS ID | Current evidence | Remaining acceptance check |
| --- | --- | --- |
| NFR-1–2 | Four 100-user runs met the SRS p95 thresholds for warmed server responses. The final build measured 223 ms for browse and 349 ms for registration or waitlisting, including its result page. [Controlled load verification](load-verification.md) | Measure hosted and browser-rendered latency in nonproduction. |
| NFR-3 | An uncached database readiness endpoint is live. | Record availability over the acceptance period. |
| NFR-6 | A synthetic Neon point-in-time recovery reached app readiness and passed browser verification in 6.251 seconds. All sampled records at the chosen point were recovered. [Recovery verification](recovery-verification.md) | Schedule and monitor daily backups and rehearse recovery at realistic volume with a deployment cutover. |
| NFR-4–5 | Each of four 100-user bursts produced 20 confirmed, 80 waitlisted, and three FIFO promotions, with zero overbookings or missing or duplicate registrations. [Controlled load verification](load-verification.md) | Repeat on hosted nonproduction infrastructure before using these measurements to assess deployment capacity. |
| NFR-7 | Simulated notices are written in the registration transaction. | Record timing from trigger to inbox visibility and verify the required 99% within five minutes. |
| NFR-8 | Changes and cancellations with live delivery and retries are full-system scope. | Validate with the notification pipeline if those features are added. |
| NFR-9 | New hashes use Argon2id. The production demo audit confirmed zero legacy hashes after upgrading the bootstrap account. [Password tests](../tests/password.test.js) | Review password handling if the identity model changes. |
| NFR-10 | Production redirected HTTP with status 308 and returned HTTP 200 over a connection constrained to TLS 1.2. HSTS was present in the header audit. | Confirm the minimum allowed protocol in the deployment policy and retain the evidence. |
| NFR-11 | Vercel Production uses the restricted PostgreSQL runtime login. A 366-day-old synthetic audit entry and append-only runtime grants survived both restore rehearsals. [Recovery verification](recovery-verification.md) | Verify coverage of all access denials and an operating one-year retention and restore procedure. |
| NFR-12 | Dependency audit, browser isolation headers, role and input checks, and a passive ZAP sample of five public responses with zero high and four medium alerts. [Security verification](recovery-verification.md#passive-web-security-evidence) | Review the content security policy findings and complete authenticated and defensive input and cross-origin verification. |
| NFR-13 | Server actions delegate to authentication, event, and database modules. The regression suite covers the main workflows. | Record QA-07 change-isolation evidence and complete the design-to-code mapping for submission. |
| NFR-14 | The browser suite exercises the registration path and status changes. | Run the participant protocol below. At least 90% must find and register for the event within two minutes. |
| NFR-15 | Chromium checks a 360 px event page, keyboard skip navigation, and focus after server-side errors and cancellation. The [workflow spec](../tests/browser/mvp.spec.js) checks horizontal keyboard scrolling of a populated roster. [Automated accessibility specs](../tests/browser/accessibility.spec.js) scan public pages at mobile and desktop widths. | Verify all screens manually with keyboard and assistive technology, review contrast, and record WCAG 2.1 AA results. |
| NFR-16 | Vercel executes the stateless app. Sessions and request limits use PostgreSQL. | Measure scaling to 500 concurrent users if this optional target is pursued. |
| NFR-17 | Roster access tests cover owning organizers and administrators, with guest and attendee denial. | Complete the field-level access matrix and approve data handling for any real-user pilot. |
| NFR-18 | Tests verify the 20-login and 10-registration limits, concurrency, and rolling-window expiry. [Rate-limit tests](../tests/rate-limit.test.js) | Keep the trusted client IP regression in CI. |
| NFR-19 | CI enforces 80% statement coverage per backend file. This matrix identifies test links and remaining checks. | Finish the partial and open Must checks and attach the passing coverage and test reports for the submitted commit. |

## Participant usability and manual accessibility

Use consenting first-time student participants and fictional accounts in an isolated demo. Start each participant on Explore with a test account already signed in. Give one task: find the named event and register. Start timing when the task is given and stop when the participant reaches the confirmation. Record completion, elapsed seconds, and where they hesitated. Count all attempts when evaluating whether at least 90% completed in under two minutes.

For manual accessibility, use a keyboard at 360 px and desktop widths and repeat key tasks with a screen reader. Check the skip link, registration and waitlist labels, approval form error focus, status announcements, and cancellation confirmation. Verify contrast and zoom on the homepage, attendee views, and admin views. Record the browser, assistive technology, and result for each check. Browser automation provides repeatable regression evidence. Participant timing and screen-reader observations are still open.

## Architecture conformance

| SAD and SADD component | Implemented component | Status |
| --- | --- | --- |
| React presentation | [Next.js page and components](../app/page.js) | React retained |
| Spring API and service layer | [Next.js Server Actions](../app/actions.js) · [Authentication](../lib/auth.js) · [Events](../lib/events.js) | Runtime and interface deviation to record in SAD and SADD |
| PostgreSQL persistence and sessions | [Schema](../lib/schema.sql) · [Connection pool](../lib/db.js) | PostgreSQL retained on Neon |
| Notification outbox, worker, retries | Registration transaction writes simulated inbox records. [Event service](../lib/events.js) | Delivery design deviation to record |
| Nginx and Docker Compose deployment | Vercel and Neon. [Deployment instructions](../README.md#deploy-to-vercel-and-neon) | Deployment deviation to record |

## Defect and follow-up log

| Finding | Disposition |
| --- | --- |
| Administrator roster access covered published events only. | Added a role-checked directory that includes all event statuses. |
| One demo account retained a legacy scrypt hash. | Verified the existing bootstrap password and upgraded its hash in production Neon. Confirmed zero legacy hashes afterward. |
| Event-card links had mismatched visible and accessible names. | Fixed and verified through a browser regression and follow-up automated scan. |
| Homepage color contrast requires manual review. | Open in the accessibility acceptance checks. |
| Operational retention, restore, and application security evidence are incomplete. | Open in the nonfunctional acceptance checks. |
