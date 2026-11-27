# Prototype verification record

This record covers the SRS prototype scope and the evidence needed for course submission. It tracks implementation separately from acceptance evidence so that a passing workflow cannot stand in for a requirement's full acceptance criteria.

## Uploaded document conformance

The audit uses the prototype boundary in SRS §1.2 and Table 3. Of 63 functional requirements, 29 are included, three are included with simulated delivery, four are included in part, and 27 are specified for the full system. All 36 prototype rows appear below. An SRS test case ID identifies the documented acceptance case. The evidence column identifies the check implemented in this repository.

| Source | Finding |
| --- | --- |
| PA1 Project Management Plan §§1.4, 3.1, 4.3, and 5 | The repo supplies the limited prototype, setup instructions, tests, coverage, and PR reviews. The plan's earlier scope deferred approval. The later SRS and SADD include submission, the queue, and publishing. Team milestone sign-off, weekly progress tracking, and the final presentation require separate course records. WBS 5.3 still needs resolution of the design deviations below. |
| PA2 Software Requirements Specification §§1.2, 3.1–3.4, and 6 | The three prototype workflows are implemented. The tables below record remaining acceptance evidence for individual requirements and misuse cases. |
| PA3 Software Architecture Document §§3.2, 5, and 6 | The public catalog has a Spring implementation. The deployed application still uses its Next.js backend. The architecture decisions and their implementation differences are listed below. |
| PA4 Software Architecture and Detailed Design Table 2 and §§3–5, 9–10 | The catalog has a controller, service, and repository in Java. The rest of the prototype still needs the specified Java interfaces, session and outbox design, and deployment. The supplied file contains authored design sections and later verification and implementation template prompts. The completed repository evidence belongs with the submission. |

## Test plan and evidence

Run tests against an isolated local or CI PostgreSQL instance populated only with synthetic records. Use the commands in the [README](../README.md#prototype-verification). GitHub Actions saves the PostgreSQL, coverage, build, and Chromium results for each PR and push to main. Attach a passing run for the submitted commit to the course evidence package.

- Unit tests exercise password handling, form validation, client IP handling, and the readiness error response. CI measures statement coverage for the input and password modules in a dedicated run without PostgreSQL.
- PostgreSQL integration tests exercise access control, persisted event state, audit entries, concurrent registration, waitlist ordering, and notification writes.
- Chromium checks the organizer, administrator, attendee, and guest flows through the built application.
- Acceptance checks measure response times and first-time usability, verify accessibility and application security, and rehearse recovery. Record the environment, run date, observed result, and linked evidence for each check.

On November 22, 2026, the acceptance run used Node.js 22.12 and Java 21 with disposable loopback PostgreSQL 18.7. All 38 Node tests passed with 98.94% statements covered across the measured backend files. The separate input and password run passed seven tests with 100% statement coverage for both modules. All 11 Spring tests passed with 40 of 44 Java source lines covered (90.91%) and all 20 measured branches covered. Chromium passed all 14 standard checks with the restricted database role and passed the two Spring catalog checks in separate running and outage tests. The authenticated workspace scans found zero violations from the selected axe WCAG A and AA rules. A hosted Preview readiness check verified database isolation with a unique fixture marker. A hosted 100-user burst preserved registration integrity. Browse, search, and detail stayed under their p95 targets, while registration reached 2,207 ms against a 2,000 ms target. See the [hosted measurements](load-verification.md#hosted-preview).

## Functional requirements

Test links identify where the evidence lives. **Partial evidence** means the test covers a subset of the requirement's acceptance criteria. **Prototype subset** records an explicit scope limit in SRS Section 3.1.

| SRS ID | SRS test cases | Evidence | Status |
| --- | --- | --- | --- |
| FR-1 | TC-01 | Browser signup with name, email, and password. [Chromium workflow](../tests/browser/mvp.spec.js) | Verified |
| FR-2 | TC-02 | Invalid domain and duplicate email are rejected with a reason. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-3 | TC-03 | Password-rule boundaries and signup rejection are tested. [Validation specs](../tests/input.test.js) · [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-4 | TC-04 | Incorrect login fails and correct login creates a readable session. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-5 | TC-05 | Five failed attempts set a 15-minute lock. An expired lock permits another attempt. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-6 | TC-06 | Sessions start with a 30-minute idle expiry and an additional 12-hour cap. Tests exercise sign-out, idle expiry, and the absolute cap. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-7 | TC-01 | New accounts receive only the Attendee role. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-8 | TC-07 | PostgreSQL tests apply all eight combinations of optional roles to an existing session. Chromium verifies that Organizer grants and removals take effect and deactivation invalidates the session. [Browser access specs](../tests/browser/account-access.spec.js) · [PostgreSQL workflows](../tests/prototype.test.js) | Verified for prototype roles and account status |
| FR-9 | TC-08, TC-09, TC-70 | Chromium checks all six protected workspaces for guest, attendee, owning organizer, other organizer, approver, and system administrator. Integration tests check role and ownership denials and their audit rows for drafts, submissions, approvals, capacity changes, registration, cancellation, and account updates. [Browser role matrix](../tests/browser/role-visibility.spec.js) · [PostgreSQL workflows](../tests/prototype.test.js) | Verified for the listed prototype access boundaries |
| FR-11 | TC-11 | Organizer creates a draft with the required event fields. [Chromium workflow](../tests/browser/mvp.spec.js) | Verified |
| FR-12 | TC-12 | Missing required fields, malformed dates, past starts, equal start and end times, zero or fractional capacity, and a deadline after start are rejected. [PostgreSQL workflows](../tests/prototype.test.js) | Verified for the listed prototype validation rules |
| FR-13 | TC-13 | Organizer saves and edits a draft before submission. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-14 | TC-14 | Six simultaneous submissions admit five and leave the sixth in draft. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-15 | TC-15 | Approval queue orders submissions oldest first and filters by organizer. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-16 | TC-16 | Administrator publishes a pending event and the event accepts registrations. [Chromium workflow](../tests/browser/mvp.spec.js) | Verified |
| FR-21 | TC-21 | Published event appears in the public list. [Chromium workflow](../tests/browser/mvp.spec.js) | Prototype subset, list view |
| FR-24 | TC-24 | Event detail is rendered and registration behavior reflects remaining capacity. [Chromium workflow](../tests/browser/mvp.spec.js) | Partial evidence for every displayed field and count |
| FR-25 | TC-25 | Chromium checks direct links and Explore search for draft, pending, and published events across six role and ownership cases. [Browser role matrix](../tests/browser/role-visibility.spec.js) | Verified for the three prototype states. Completed and Cancelled lifecycle transitions are full-system work. |
| FR-26 | TC-26 | An attendee confirms a seat for a published event before its deadline. [Chromium workflow](../tests/browser/mvp.spec.js) | Verified |
| FR-27 | TC-27 | An isolated 50-attendee last-seat test calls the REST registration route, then checks the persisted seat count, waitlist order, and roster. [P-1 API test](../tests/browser/mvp-api.spec.js) | Verified for the MVP REST workflow |
| FR-28 | TC-28 | Duplicate confirmed and waitlist entries are rejected. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-29 | TC-29 | Full event accepts a waitlist entry and stores each member’s join timestamp. [Chromium workflow](../tests/browser/mvp.spec.js) · [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-30 | TC-29 | Waitlist positions are assigned and the next position updates after promotion. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-31 | TC-30 | Confirmed and waitlist cancellation work before the event. PostgreSQL retains the cancelled registration and timestamp, while active rosters and My Events show active rows. Re-registration creates a new row. [Chromium workflow](../tests/browser/mvp.spec.js) · [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-32 | TC-31, TC-33 | Cancelling a confirmed seat promotes the first waitlisted attendee. [PostgreSQL workflows](../tests/prototype.test.js) · [Chromium workflow](../tests/browser/mvp.spec.js) | Verified |
| FR-33 | TC-32 | Registration after the deadline and for draft and pending events is rejected. [PostgreSQL workflows](../tests/prototype.test.js) | Verified for the prototype states |
| FR-34 | TC-33 | Capacity increase promotes a waitlisted attendee. Changes exceeding venue capacity or falling below the confirmed count are rejected. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-35 | TC-34 | Administrator can open a draft, pending, or published roster. Organizers are restricted to their own events. Guests and other users are denied. [PostgreSQL workflows](../tests/prototype.test.js) · [Chromium workflow](../tests/browser/mvp.spec.js) | Verified for authorization and roster contents used by the test |
| FR-37 | TC-36 | My Events shows current status and waitlist position, groups past events, and explains the cancellation cutoff. [Chromium workflow](../tests/browser/mvp.spec.js) | Verified for the browser scenarios |
| FR-39 | TC-37 | Registration creates a confirmation entry. [PostgreSQL workflows](../tests/prototype.test.js) | Verified for simulated delivery |
| FR-40 | TC-38 | Waitlist notices contain the assigned position, and promotion notices reach the promoted attendee. Both contents are checked in PostgreSQL and Chromium. [PostgreSQL workflows](../tests/prototype.test.js) · [Chromium workflow](../tests/browser/mvp.spec.js) | Verified for simulated delivery |
| FR-45 | TC-42 | PostgreSQL checks message type, recipient, creation and delivery times. Chromium verifies that each attendee sees their own notice and that the other attendee's notice is absent. [PostgreSQL workflows](../tests/prototype.test.js) · [Chromium workflow](../tests/browser/mvp.spec.js) | Verified for the simulated inbox scenarios |
| FR-46 | TC-43 | Catalog seeded with sample venues. [Schema](../lib/schema.sql) | Prototype subset, sample data |
| FR-48 | TC-45 | Organizer selects a venue in the event form. [Chromium workflow](../tests/browser/mvp.spec.js) | Prototype subset, venue selection |
| FR-52 | TC-49 | Draft capacity above the venue limit is rejected. [PostgreSQL workflows](../tests/prototype.test.js) | Verified |
| FR-62 | TC-57 | Audit tests check account and roster actions, allowed and denied outcomes, and trusted source IP attribution. [PostgreSQL workflows](../tests/prototype.test.js) | Prototype subset, partial evidence for the full audit matrix |

Rejection, resubmission, published event cancellation and completion, month and week calendars, resource management, check-in, reporting, and live notification delivery are full-system work. Keyword search is available in the deployed prototype as an enhancement.

## Nonfunctional requirements

| SRS ID | SRS test cases | Current evidence | Remaining acceptance check |
| --- | --- | --- | --- |
| NFR-1–2 | TC-59, TC-60 | Four 100-user runs met the SRS p95 thresholds for warmed server HTTP responses. [Controlled load verification](load-verification.md) | Hosted browse, search, and detail p95 passed. Bring hosted registration p95 below 2,000 ms and run the sustained workloads with two instances and browser-rendered timing. [Hosted measurements](load-verification.md#hosted-preview) |
| NFR-3 | TC-61 | An uncached database readiness endpoint is live. Spring has separate liveness and readiness checks. | Record availability over the acceptance period, the maintenance window and advance notice, and recovery from an application instance failure within 15 minutes with no lost confirmations. |
| NFR-6 | TC-62 | Two isolated Neon restore drills reached application readiness. The November 22 Preview restore preserved the selected audit boundary and returned catalog data in 2.377 seconds. [Recovery verification](recovery-verification.md) | Schedule and monitor daily backups and rehearse recovery at realistic volume with a deployment cutover. |
| NFR-4–5 | TC-27, TC-31 | Each of four 100-user bursts produced 20 confirmed, 80 waitlisted, and three FIFO promotions, with zero overbookings or missing or duplicate registrations. [Controlled load verification](load-verification.md) | A hosted 100-user burst also preserved capacity, uniqueness, and FIFO order. Repeat under sustained traffic on the specified deployment. [Hosted measurements](load-verification.md#hosted-preview) |
| NFR-7 | TC-37, TC-38 | Simulated notices are written in the registration transaction. The database test checks that the difference between the recorded creation and delivery times is under five minutes in the fixture. Chromium checks inbox visibility after the action. [PostgreSQL workflows](../tests/prototype.test.js) · [Chromium workflow](../tests/browser/mvp.spec.js) | Measure trigger-to-inbox time across a representative sample and verify 99% delivery within five minutes. |
| NFR-8 | TC-40 | Change and cancellation notices correspond to FR-42 and FR-43, which Table 3 places beyond the prototype. The SADD still specifies a retrying outbox for simulated prototype messages. | The full-system check requires 99% delivery within 15 minutes and at least three retries. Verify the simulated outbox separately when it is implemented. |
| NFR-9 | TC-63 | New hashes use Argon2id. The production demo audit confirmed zero legacy hashes after upgrading the bootstrap account. [Password tests](../tests/password.test.js) | Review password handling if the identity model changes. |
| NFR-10 | TC-64 | Production redirected HTTP with status 308 and returned HTTP 200 over a connection constrained to TLS 1.2. HSTS was present in the header audit. | Confirm the minimum allowed protocol in the deployment policy and retain the evidence. |
| NFR-11 | TC-08, TC-09, TC-57 | Vercel Production uses the restricted PostgreSQL runtime login. A 366-day-old synthetic audit entry and append-only runtime grants survived both restore rehearsals. [Recovery verification](recovery-verification.md) | Verify coverage of all access denials and an operating one-year retention and restore procedure. |
| NFR-12 | TC-65 | Dependency audit, browser isolation headers, role and input checks, and a passive ZAP sample of five public responses with zero high and four medium alerts. [Security verification](recovery-verification.md#passive-web-security-evidence) | Review the content security policy findings and complete authenticated and defensive input and cross-origin verification. |
| NFR-13 | TC-66 | Server actions delegate to authentication, event, and database modules. The regression suite covers the main workflows. | Record QA-07 change-isolation evidence and complete the design-to-code mapping for submission. |
| NFR-14 | TC-67 | The browser suite exercises the registration path and status changes. | Run the participant protocol below. At least 90% must find and register for the event within two minutes. |
| NFR-15 | TC-68 | Chromium checks a 360 px event page, keyboard skip navigation, and focus after server-side errors and cancellation. The [workflow spec](../tests/browser/mvp.spec.js) checks horizontal keyboard scrolling of a populated roster. Axe scans [public pages](../tests/browser/accessibility.spec.js) at mobile and desktop widths and [all six protected workspaces](../tests/browser/role-visibility.spec.js). | Verify all screens manually with keyboard and assistive technology, review contrast, and record WCAG 2.1 AA results. |
| NFR-16 | TC-69 | Vercel executes the stateless app. Sessions and request limits use PostgreSQL. | Measure scaling to 500 concurrent users if this optional target is pursued. |
| NFR-17 | TC-70 | Chromium verifies that the populated roster shows the attendee name, email, registration time, and status to the owning organizer and approver. Guest, attendee, non-owning organizer, and system administrator without approval privileges see only the public event details. [Browser role matrix](../tests/browser/role-visibility.spec.js) | Define and approve field-level access and handling for any additional student data used in a real-user pilot. |
| NFR-18 | TC-71 | Tests verify the 20-login and 10-registration limits, concurrency, and rolling-window expiry. [Rate-limit tests](../tests/rate-limit.test.js) | Keep the trusted client IP regression in CI. |
| NFR-19 | TC-72 | Node CI enforces 80% statement coverage per backend file across unit and PostgreSQL integration tests, with a separate 80% unit-only statement check for input and passwords. Maven enforces 80% aggregate Java line coverage across its tests, and Spring CI uploads HTML and XML reports. [Verification commands](../README.md#prototype-verification) | Expand standalone unit coverage beyond input and passwords and attach the results for the submitted commit. Finish open Must checks within the scoped prototype. |

## Security and misuse cases

| SRS case | Verified behavior and remaining evidence |
| --- | --- |
| AC-1 · TC-09 | Chromium checks workspace and event read access for six role and ownership cases. PostgreSQL integration tests verify permission denials and actor, action, target, outcome, and source IP on the corresponding audit records. Maintain this coverage as protected endpoints move to Spring. |
| AC-2 · TC-05, TC-63, TC-71 | Lockout, adaptive password hashing, failure logging, and login limits have regression tests. Preserve these when migrating authentication. |
| AC-3 · TC-70 | The [P-3 roster API test](../tests/browser/mvp-api.spec.js) checks HTTP 401/403, denial audit rows, and allowed roster fields. The report and audit-log endpoints in the full protocol belong to the full-system scope. |
| AC-4 · TC-02, TC-28, TC-60, TC-71 | Duplicate emails and registrations are rejected, and test users are rate limited. Sustained load evidence remains open. |
| AC-5 · TC-65 | Server validation, parameterized PostgreSQL queries, framework request controls, and a passive scan cover parts of the case. The full defensive form verification set remains open. |
| AC-6 · TC-27, TC-31 | Registration tests and the controlled load harness verify capacity, uniqueness, and FIFO promotions on the current implementation. |
| AC-7 · TC-58 | The runtime role is append-only for audit entries. The full-system audit viewer is deferred, and denial coverage and one-year retention evidence remain open. |
| AC-8 · TC-14, TC-50 | Concurrent submissions enforce the five-pending-event limit, and the queue filters by organizer. Booking release for rejected and cancelled events is full-system scope. |

## Participant usability and manual accessibility

Use consenting first-time student participants and fictional accounts in an isolated demo. Start each participant on Explore with a test account already signed in. Give one task: find the named event and register. Start timing when the task is given and stop when the participant reaches the confirmation. Record completion, elapsed seconds, and where they hesitated. Count all attempts when evaluating whether at least 90% completed in under two minutes.

For manual accessibility, use a keyboard at 360 px and desktop widths and repeat key tasks with a screen reader. Check the skip link, registration and waitlist labels, approval form error focus, status announcements, and cancellation confirmation. Verify contrast and zoom on the homepage, attendee views, and admin views. Record the browser, assistive technology, and result for each check. Browser automation provides repeatable regression evidence. Participant timing and screen-reader observations are still open.

## Architecture conformance

| SAD decision and SADD design | Implemented component | Conformance |
| --- | --- | --- |
| D1–D2 · Java 21 Spring Boot modular monolith with controller, service, and repository layers | The Java public catalog follows that layering. [Spring catalog](../backend/src/main/java/edu/umd/cems/catalog) · [Next.js Server Actions](../app/actions.js) | Partial. Staging Explore can read from Spring. Production and the protected operations still use Next.js. |
| D3 · PostgreSQL 16 and Spring Data JPA | PostgreSQL on Neon, PostgreSQL 16 in CI, and a Spring Data catalog repository with access through restricted views. [Schema](../lib/schema.sql) · [Catalog repository](../backend/src/main/java/edu/umd/cems/catalog/CatalogRepository.java) | Partial. The current app still uses direct SQL for transactions, role and session persistence, and most reads. The deployed schema differs from the SADD entity model. |
| D4 · Dedicated seat-record lock and active-registration uniqueness | Node uses a 1.5-second lock timeout on the event row, enforces one active registration per account and event, retains cancellations, and promotes waitlisted attendees in FIFO order. [Seat lock](../lib/event/seat-lock.js) · [Registration service](../lib/registration/service.js) · [Schema](../lib/schema.sql) | The event row currently serves as the seat record. The separately modeled Spring seat entity remains migration work. |
| D5 · Transactional outbox, worker, and retries | The registration transaction inserts the simulated inbox record. The daily cron removes expired sessions and stale rate limits. [Notification service](../lib/notification/service.js) · [Cleanup route](../app/api/cron/cleanup/route.js) | The durable outbox, retries, and 30-day cleanup of delivered outbox entries remain open. Inbox history is a separate user-facing record. |
| D6 · Spring Security and shared Spring Session JDBC | The production app stores hashed session tokens and rate-limit counters in PostgreSQL. Spring Security protects the catalog routes. [Node authentication](../lib/auth.js) · [Spring security](../backend/src/main/java/edu/umd/cems/security/SecurityConfig.java) | Partial. An opt-in Spring endpoint can resolve and renew the existing application sessions in staging through a dedicated database login. Spring credential issuance, protected writes, shared Spring Session JDBC, and centralized denial auditing remain open. The SRS allows Argon2id. The design names bcrypt, so account migration needs an explicit hashing decision and a compatibility test for existing accounts. |
| D7 · React 18 SPA over documented REST/JSON contracts | React in Next.js renders server pages. The Spring catalog serves public events and venues. The registration and roster REST routes share service logic with the built-in UI and emit the SADD JSON errors. [API guide](../README.md#registration-and-roster-api) · [Spring API](../backend/README.md#public-event-api) | Partial. Other documented REST routes, including cancellation by registration ID, and the SPA architecture remain open. The MVP supports cancellation in the UI. |
| D8 · Simulated notification and local identity adapters | Local accounts and a simulated in-app inbox meet the chosen prototype behavior. [Authentication](../lib/auth.js) · [Inbox](../app/page.js) | The design's injected identity and notification adapters are still open. |
| SAD §3.2.4 · Nginx HTTPS and Docker Compose with two Spring instances and PostgreSQL | Vercel serves the prototype over HTTPS with Neon. [Deployment instructions](../README.md#deploy-to-vercel-and-neon) | Deployment deviation. The specified topology and its application-instance failover test remain open. |

The Next.js prototype separates [event and approval](../lib/event/), [registration and roster](../lib/registration/), [catalog](../lib/catalog/), [venue](../lib/venue/), and [notification](../lib/notification/) into modules. Event and registration SQL live in their repositories. The catalog delegates to the event service for event data.

## Defect and follow-up log

| Finding | Disposition |
| --- | --- |
| Administrator roster access covered published events only. | Added a role-checked directory that includes all event statuses. |
| One demo account retained a legacy scrypt hash. | Verified the existing bootstrap password and upgraded its hash in production Neon. Confirmed zero legacy hashes afterward. |
| Event-card links had mismatched visible and accessible names. | Fixed and verified through a browser regression and follow-up automated scan. |
| Homepage color contrast requires manual review. | Open in the accessibility acceptance checks. |
| Operational retention, restore, and application security evidence are incomplete. | Open in the nonfunctional acceptance checks. |
