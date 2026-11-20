# Recovery and security verification

This record covers isolated local and managed recovery rehearsals for SRS NFR-6, audit-log preservation for NFR-11, and passive web security analysis for NFR-12. Both recovery rehearsals used fictional data.

## Synthetic restore result

On November 19, 2026 at 11:20 p.m. Eastern, a cleanly stopped PostgreSQL 18.7 source cluster was compressed, extracted into a separate data directory, started, and verified over loopback. The source used the repository schema, runtime grants, and fictional data. All checks below ran against the recovered cluster. [PostgreSQL file-system backup procedure](https://www.postgresql.org/docs/18/backup-file.html)

| Measurement | Observed result |
| --- | --- |
| Backup creation after clean shutdown | 0.693 s |
| Compressed archive size | 5,110,844 bytes |
| Recovery from extraction through startup and verification | 0.428 s |
| Sampled records lost | 0 of 16 committed rows |
| Restored state | Three accounts, four venues, one event, one confirmed registration, one waitlist entry, one session, two notifications, one rate-limit bucket, and two audit entries matched the source snapshot |
| Audit and identity checks | The oldest fixture audit row was 366 days old. The runtime login could append an audit entry and lacked audit read, update, delete, and truncate privileges. A new registration received the next unused identity value. |

The measured recovery time covers local extraction, startup, and verification of a small synthetic archive. The production objectives are daily backup coverage, at most 24 hours of data loss, and recovery within four hours.

## Managed Neon rehearsal

On November 19, 2026 at 11:31 p.m. Eastern, an isolated schema-only Neon branch was populated with fictional accounts and a published event. A recovered branch was created at the WAL position captured after the fixture commit. One audit marker committed after that point simulated a change made shortly before the incident.

| Measurement | Observed result |
| --- | --- |
| Simulated incident time minus verified recovery point | 1.121 s |
| Simulated incident through restored app readiness and browser verification | 6.251 s |
| Recovered records | Two accounts, four venues, one event, one confirmed registration, one inbox entry, and a 366-day-old audit marker |
| Recovery boundary | All sampled records committed at the recovery point were present. The marker committed later was absent as expected. |
| Application verification | A local production build passed readiness, sign-in, waitlist registration, persistence, and sign-out using the recovered branch and a restricted login. Its audit insert grant and read and delete restrictions survived. |

The test began with a running source and measured recovery of a small synthetic dataset. Daily backup coverage, backup age monitoring, production recovery at realistic data volume, and an application redeploy or traffic switch still need operating evidence.

## Recovery and retention procedure

1. Confirm the Neon backup mechanism, available restore window, responsible maintainer, and alert destination. Record whether the restore capability meets the one-day data-loss objective in the deployment plan. [Neon history window](https://neon.com/docs/postgres/backup-restore/history-window)
2. Rehearse with synthetic records on a separate nonproduction Neon branch. Record the simulated incident time, the selected recovery point, and the last committed fixture at that point. Restore to a new branch and keep the original branch available for comparison. [Neon branch restore](https://neon.com/docs/postgres/backup-restore/branch-restore)
3. Verify accounts, event capacity, confirmed and waitlisted registrations, notifications, sessions, audit entries, and runtime privileges. Point a nonproduction deployment at the recovered branch and exercise readiness, sign-in, registration, and sign-out with synthetic users.
4. Record elapsed time from the incident decision through restored application readiness, and the time difference between the simulated incident and the newest recoverable committed change. Compare these two measurements with the SRS targets.
5. Retain at least one year of audit history under an approved policy. Define archive access, storage location, integrity checks, and restore ownership. Keep the Vercel runtime role restricted to appending audit rows. Verify the archive and restore process under a separate maintenance identity.

Neon documents a six-hour point-in-time history window with a 1 GB history limit on the Free plan. For daily backup coverage on that plan, use scheduled logical backups to separate encrypted storage, monitor their age, and rehearse restoring one to a disposable database. [Neon history window](https://neon.com/docs/postgres/backup-restore/history-window) · [Neon guide to nightly Postgres backups](https://neon.com/docs/manage/backups-aws-s3-backup-part-2)

For a local file-level repeat, start a fresh isolated PostgreSQL cluster using the same server major version, apply `lib/schema.sql`, load fictional records across the affected tables, and apply `lib/runtime-grants.sql` to a new restricted login. Record the committed rows and verify that no test connects to a remote host. Shut down the source cleanly, archive its data directory, extract into a new empty directory, and start the restored copy on loopback. Compare row values, test a fresh identity insert in a rolled-back transaction, and check the restricted login against the recovered audit and registration tables. Keep fixture credentials and archives out of the repository.

## Production database access

On November 19, 2026, Vercel Production moved to a dedicated pooled `terrapin_runtime` secret and dropped the direct migration connection from its environment. The isolated credential change was applied by rebuilding the last ready release. Live readiness, sign-in, the protected Approvals view, and sign-out passed after the cutover. The existing Preview variables retained their original scope and values. Isolating Preview database access is a separate follow-up.

## Passive web security evidence

OWASP ZAP 2.17.0 completed passive analysis with exit code 0 on November 19, 2026. It repeated the initial baseline against the local production build of the reviewed registration update, commit `1a8d68f`. The event listing, event detail, sign-in, sign-up, and readiness endpoint all returned HTTP 200. The plan used an exact loopback scope, five fixed GET requests, a passive queue wait, and JSON reporting. [ZAP passive scanner](https://www.zaproxy.org/docs/desktop/addons/passive-scanner/) · [ZAP requestor job](https://www.zaproxy.org/docs/desktop/addons/automation-framework/job-requestor/)

The latest report contained four distinct medium alerts (nine instances), zero low or high alerts, and one distinct informational alert (two instances). ZAP's report scale tops out at high. These results cover the five sampled responses. NFR-12 still needs authenticated coverage and evidence for the defensive input handling and cross-origin request controls.

| ZAP finding | Review |
| --- | --- |
| 10055 — Three medium CSP alerts across seven instances | The current policy limits framing, object loading, base URLs, and form destinations. Script and style sources have no explicit directives or default source fallback. ZAP reports that inline scripts and styles are consequently permitted. A tighter policy needs browser regression coverage for Next.js hydration and forms. |
| 10202 — Medium, low confidence, two instances | ZAP looked for a named anti-CSRF token in the sign-in and sign-up forms. Both use Next.js Server Actions, for which the framework compares the origin and host. The application uses the default allowed-origin configuration. Behavior through the deployed reverse proxy remains to be verified. [Next.js Server Actions configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions) |
| 10031 — Informational, low confidence, two instances | ZAP reported possible attribute matching on the event and view parameters. The event sample matched `1` in the static viewport setting `initial-scale=1`. The scan report supplied no reflected value for the sign-in sample. |

The recovered 366-day-old fixture and the runtime grant checks demonstrate audit row preservation in this rehearsal. Verification of one-year production retention and complete logging of unauthorized attempts still requires production operations evidence.
