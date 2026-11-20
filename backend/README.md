# Terrapin Events Spring backend

The backend uses Spring Boot 3 and Java 21. It runs alongside the Next.js application during the migration. The live Vercel app still connects directly to PostgreSQL.

## Run locally

1. Create a local PostgreSQL database and apply the repository schema as the database owner. Follow the [local database setup](../README.md#run-locally) and [runtime role instructions](../README.md#database-runtime-role) to create a restricted login.
2. Set `CEMS_DB_URL` to a JDBC URL such as `jdbc:postgresql://127.0.0.1:5432/terrapin`. Set `CEMS_DB_USER` and `CEMS_DB_PASSWORD` to the restricted login. Keep local credentials outside Git.
3. From `backend`, run `./mvnw spring-boot:run` on macOS or Linux, or `.\mvnw.cmd spring-boot:run` on Windows. The wrapper downloads a pinned Maven distribution. The service binds to `127.0.0.1:8080` by default.

Send a GET request to `/actuator/health/liveness` to check whether the service is running. `/actuator/health/readiness` also checks its PostgreSQL connection and returns HTTP 503 when the database is unavailable. Only the health probes are available at this stage.

Run `./mvnw verify` with a disposable local PostgreSQL database and its restricted test credentials. GitHub Actions verifies the service against an isolated PostgreSQL 16 instance. Schema setup uses the existing SQL files. Spring and Hibernate schema initialization are disabled.
