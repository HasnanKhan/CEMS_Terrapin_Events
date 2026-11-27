# PA5 repository guide

Team 1 · Terrapin Events · ENPM 613 · Fall 2026

Use the pinned [`pa5-fall-2026` tag](https://github.com/HasnanKhan/CEMS_Terrapin_Events/tree/pa5-fall-2026) for static review. The tag includes the code and final documentation. The last application change at this submission baseline is [`4aabc92`](https://github.com/HasnanKhan/CEMS_Terrapin_Events/commit/4aabc92d2bc1f7ce2724efd8b153816fb7fe62c4). The repository is public and is available without a GitHub account. The [public prototype](https://cemsterrapinevents.vercel.app/) supports guest browsing. The team uses fictional accounts for the authenticated demonstration.

| Review material | Location |
| --- | --- |
| As-built architecture, deployment, and decisions | [Final SAD](SAD.md) |
| Interfaces, responsibilities, invariants, and design principles | [Final SADD](SADD.md) |
| SRS, SAD, SADD, source files, verification, and disposition | [Architecture-to-implementation traceability](traceability.md) |
| All 36 scoped functional rows, quality attributes, and misuse cases | [Prototype verification](../prototype-verification.md) |
| Measured workloads and operating evidence | [Load results](../load-verification.md) · [Recovery and security](../recovery-verification.md) |

## Source inventory

| Location | Role |
| --- | --- |
| [`app/`](../../app/) and [`proxy.js`](../../proxy.js) | React pages, Next.js actions and HTTP handlers, and browser security policy. |
| [`lib/`](../../lib/) | Feature services, SQL repositories, authorization, database transactions, and optional Spring clients. |
| [`lib/schema.sql`](../../lib/schema.sql) and [`lib/runtime-grants.sql`](../../lib/runtime-grants.sql) | PostgreSQL entities, integrity constraints, and least-privilege grants. |
| [`backend/`](../../backend/) | Java 21 Spring Boot public catalog and optional staging session resolver. Includes JPA mappings, SQL security views and functions, Maven configuration, and tests. |
| [`tests/`](../../tests/) and [`scripts/`](../../scripts/) | Node, PostgreSQL, Chromium, setup, and local load verification. |
| [`vercel.json`](../../vercel.json), [`neon.ts`](../../neon.ts), [`next.config.mjs`](../../next.config.mjs), and [`.github/workflows/`](../../.github/workflows/) | Deployment, application config, and CI. Runtime settings are injected by the hosting services. |

## Dependencies and provenance

- The deployed application uses Node.js 22, React, Next.js, node-postgres, and the Argon2 library. The staging backend uses Java 21, Spring Boot, Spring Security, Spring Data JPA, the PostgreSQL JDBC driver, and Actuator. Dependency versions and transitive dependencies are recorded in [package.json](../../package.json), [package-lock.json](../../package-lock.json), and [backend/pom.xml](../../backend/pom.xml).
- Vercel supplies HTTPS termination, deployment infrastructure, and cron delivery. Neon provides managed PostgreSQL connections, pooling, and restore capabilities. GitHub Actions supplies CI runners. The repository contains the team’s application rules, SQL, interfaces, tests, and deployment settings. Provider settings and credentials are managed outside Git.
- `package-lock.json` and the Maven Wrapper are tool-generated dependency and bootstrap inputs. Next.js bundles and Maven build outputs are generated during builds. AI assistance was used during implementation, testing, and documentation. The linked source and checks are the evidence for the architecture claims.

## Verified implementation baseline

| Evidence | Result |
| --- | --- |
| [Node and Chromium workflow](https://github.com/HasnanKhan/CEMS_Terrapin_Events/actions/runs/46039360978) | 46 Node and PostgreSQL tests passed. Measured backend statement coverage was 98.37%. The standalone input and password suite passed seven tests at 100% measured statement coverage. All 22 standard Chromium checks passed. The workflow found zero npm audit findings at that run. |
| [Spring backend workflow](https://github.com/HasnanKhan/CEMS_Terrapin_Events/actions/runs/46039360878) | 15 Java tests passed and the Java line-coverage gate passed. Chromium passed 12 Spring-enabled checks across the catalog, shared-session, and outage configurations. |
| [P-1 and P-3 API specs](../../tests/browser/mvp-api.spec.js) | The one-seat, 50-attendee test verified one confirmation, 49 waitlist entries in join order, and persisted roster and notices. The roster privacy test verified denial status, audit entries, and unchanged registration rows. |
| [Local load harness](../../scripts/load-test.mjs) | A 100-user loopback run on November 27 measured registration p95 at 414 ms, with zero duplicate or lost registrations and three FIFO promotions. The older Vercel burst reached 2,207 ms against a 2,000 ms target. |

The complete quality record includes current limits. It distinguishes synthetic recovery, passive security, automated accessibility, and local workload evidence from production operating measures and manual acceptance. The [architecture decisions](SAD.md#implementation-decisions) document the implications of the deployment and design changes. Formal course approval of those changes remains unverified.
