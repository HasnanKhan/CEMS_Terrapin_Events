import { query } from './db.js'

const batchSize = 1000

export async function cleanupExpired() {
  // Commit both batches together. Skip rows that an active request is using.
  const { rows: [counts] } = await query(`
    with expired_sessions as (
      delete from public.sessions where token_hash in (
        select token_hash from public.sessions
        where expires_at <= statement_timestamp() or absolute_expires_at <= statement_timestamp()
        order by expires_at
        limit $1 for update skip locked
      )
      returning 1
    ), stale_counters as (
      delete from public.rate_limits where (scope, subject) in (
        select scope, subject from public.rate_limits
        where last_seen < statement_timestamp() - interval '1 hour'
        order by last_seen
        limit $1 for update skip locked
      )
      returning 1
    )
    select (select count(*)::int from expired_sessions) as "expiredSessions",
      (select count(*)::int from stale_counters) as "staleRateLimits"
  `, [batchSize])
  return counts
}
