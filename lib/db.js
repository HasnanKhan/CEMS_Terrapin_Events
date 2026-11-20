import pg from 'pg'

let pool

export function database() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  if (!pool) {
    const url = new URL(process.env.DATABASE_URL)
    // Make certificate and hostname verification explicit for Neon connections.
    if (url.hostname.endsWith('.neon.tech') && url.searchParams.get('sslmode') === 'require') {
      url.searchParams.set('sslmode', 'verify-full')
    }
    pool = new pg.Pool({
      connectionString: url.toString(),
      max: 4,
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 10000,
      statement_timeout: 8000
    })
    pool.on('error', error => console.error('Idle PostgreSQL connection closed', error.code ?? error.name))
  }
  return pool
}

export const query = (sql, args) => database().query(sql, args)

export async function transaction(callback) {
  const client = await database().connect()
  try {
    await client.query('begin')
    const value = await callback(client)
    await client.query('commit')
    return value
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
