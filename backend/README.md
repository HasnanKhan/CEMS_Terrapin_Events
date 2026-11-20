# Terrapin Events Spring backend

The backend uses Spring Boot 3 and Java 21. It runs alongside the Next.js application during the migration. The live Vercel app still connects directly to PostgreSQL.

## Run locally

1. Create a local PostgreSQL database and apply the repository schema as the database owner. Follow the [local database setup](../README.md#run-locally). Create a separate `terrapin_catalog` login and apply [the read grants](sql/catalog-grants.sql) as the database owner.
2. Set `CEMS_DB_URL` to a JDBC URL such as `jdbc:postgresql://127.0.0.1:5432/terrapin`. Set `CEMS_DB_USER` and `CEMS_DB_PASSWORD` to the catalog login. Keep local credentials outside Git.
3. From `backend`, run `./mvnw spring-boot:run` on macOS or Linux, or `.\mvnw.cmd spring-boot:run` on Windows. The wrapper downloads a pinned Maven distribution. The service binds to `127.0.0.1:8080` by default.

Send a GET request to `/actuator/health/liveness` to check whether the service is running. `/actuator/health/readiness` also checks its PostgreSQL connection and returns HTTP 503 when the database is unavailable.

## Public event API

- `GET /api/events` returns `events`, `page`, and `hasNext`. It lists up to 12 published events that have yet to end, ordered by start time and event ID. The optional `q` filter matches a case-insensitive literal substring in the title or description. The optional `category` and `venue` filters match the exact category and numeric venue ID. Page numbers start at 1. Invalid or repeated filter values return HTTP 400.
- `GET /api/events/{id}` returns one published event with its registration deadline, capacity, confirmed count, and waitlist count. Past published events remain available by ID. Drafts, pending events, and missing events all return HTTP 404.
- `GET /api/venues` returns an array of public venue IDs and names, ordered by name.

The catalog login reads two owner-managed PostgreSQL views. The published-event view filters drafts and pending events at the database layer. The catalog login has no direct privileges on the underlying tables. The API returns an empty HTTP 503 when it cannot read the catalog.

When upgrading an existing Spring catalog database, take the Spring instance out of service, apply the updated grant script as owner, and start the matching JAR. The script revokes the grants used by the older Spring binary. The existing Next.js directory can serve traffic during the upgrade and rollback.

## Verify

Apply the [catalog test fixtures](src/test/resources/catalog-fixtures.sql) as the owner of a fresh disposable local PostgreSQL database with the schema and grants above. Run `./mvnw verify` from `backend` with that database's catalog login. GitHub Actions runs the same checks on an isolated PostgreSQL 16 service. Spring and Hibernate schema initialization remain disabled.
