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
| FR-3 | A weak password is rejected and a conforming password works. [PostgreSQL workflows](../tests/prototype.test.js) | Partial evidence for all password-rule boundaries |
| FR-4 | Incorrect login fails and correct login creates a readable session. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-5 | Five failed attempts lock the account. An expired lock permits another attempt. [PostgreSQL workflows](../tests/prototype.test.js) | Partial evidence for the exact 15-minute duration |
| FR-6 | Sign-out and simulated expiry invalidate sessions. [PostgreSQL workflows](../tests/prototype.test.js) | Partial evidence for the exact 30-minute inactivity interval |
| FR-7 | New accounts receive only the Attendee role. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-8 | System administrator grants Organizer access and deactivates and reactivates the account. [PostgreSQL workflows](../tests/prototype.test.js) | Partial evidence for all grant and removal combinations |
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
| FR-28 | A duplicate confirmed registration is rejected. [PostgreSQL workflows](../tests/prototype.test.js) | Partial evidence for duplicate waitlist behavior |
| FR-29 | Full event accepts a waitlist entry. [Chromium workflow](../tests/browser/mvp.spec.js) | Partial evidence for the recorded join timestamp |
| FR-30 | Waitlist positions are assigned and the next position updates after promotion. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-31 | Attendee cancels a confirmed seat before the event. [Chromium workflow](../tests/browser/mvp.spec.js) | Partial evidence for waitlist cancellation and cutoff |
| FR-32 | Cancelling a confirmed seat promotes the first waitlisted attendee. [PostgreSQL workflows](../tests/prototype.test.js) · [Chromium workflow](../tests/browser/mvp.spec.js) | Verified |
| FR-33 | Registration after the deadline is rejected. [PostgreSQL workflows](../tests/prototype.test.js) | Partial evidence for all unpublished states |
| FR-34 | Capacity increase promotes a waitlisted attendee and venue overflow is rejected. [PostgreSQL workflows](../tests/prototype.test.js) | Partial evidence for reductions below confirmed count |
| FR-35 | Administrator can open a draft, pending, or published roster. Organizers are restricted to their own events. Guests and other users are denied. [PostgreSQL workflows](../tests/prototype.test.js) · [Chromium workflow](../tests/browser/mvp.spec.js) | Verified for authorization and roster contents used by the test |
| FR-37 | The registration query returns the current attendee's status. [PostgreSQL workflows](../tests/prototype.test.js) | Partial evidence for the rendered My Events page |
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
| NFR-1–2 | Build and workflows pass on local PostgreSQL and CI. | Measure 95th-percentile page latency at 3 seconds or less and registration response at 2 seconds or less with up to 100 concurrent users in a controlled environment. |
| NFR-3, NFR-6 | An uncached database readiness endpoint is live. | Record availability, rehearse a restore into a separate database, and report recovery time and data loss. |
| NFR-4–5 | Concurrent registration and FIFO promotion tests pass. | Repeat controlled concurrency runs and retain counts of overbookings, lost entries, and duplicates. |
| NFR-7 | Simulated notices are written in the registration transaction. | Record timing from trigger to inbox visibility and verify the required 99% within five minutes. |
| NFR-8 | Changes and cancellations with live delivery and retries are full-system scope. | Validate with the notification pipeline if those features are added. |
| NFR-9 | New hashes use Argon2id. The production demo audit confirmed zero legacy hashes after upgrading the bootstrap account. [Password tests](../tests/password.test.js) | Review password handling if the identity model changes. |
| NFR-10 | Production redirected HTTP with status 308 and returned HTTP 200 over a connection constrained to TLS 1.2. HSTS was present in the header audit. | Confirm the minimum allowed protocol in the deployment policy and retain the evidence. |
| NFR-11 | Audited denials are covered by the integration suite. | Verify all access denials and record the one-year retention and restore procedure. |
| NFR-12 | Dependency audit, browser isolation headers, and current role and input checks. | Run a passive application security scan and retain findings. Complete the defensive injection, XSS, and CSRF verification cases in an isolated environment. |
| NFR-13 | Server actions delegate to authentication, event, and database modules. The regression suite covers the main workflows. | Record QA-07 change-isolation evidence and complete the design-to-code mapping for submission. |
| NFR-14 | Browser automation demonstrates the happy path. | Time first-time student participants. At least 90% must find and register for the event within two minutes. |
| NFR-15 | Chromium checks a 360 px event page. Automated checks ran on public screens and prompted a link-label fix. | Verify all screens manually with keyboard and assistive technology, review contrast, and record WCAG 2.1 AA results. |
| NFR-16 | Vercel executes the stateless app. Sessions and request limits use PostgreSQL. | Measure scaling to 500 concurrent users if this optional target is pursued. |
| NFR-17 | Roster access tests cover owning organizers and administrators, with guest and attendee denial. | Complete the field-level access matrix and approve data handling for any real-user pilot. |
| NFR-18 | Tests verify the 20-login and 10-registration limits, concurrency, and rolling-window expiry. [Rate-limit tests](../tests/rate-limit.test.js) | Keep the trusted client IP regression in CI. |
| NFR-19 | CI enforces 80% statement coverage per backend file. This matrix identifies test links and remaining checks. | Finish the partial and open Must checks and attach the passing coverage and test reports for the submitted commit. |

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
