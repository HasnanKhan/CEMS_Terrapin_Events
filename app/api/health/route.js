import { query } from '../../../lib/db.js'

export const dynamic = 'force-dynamic'

export async function GET() {
  const headers = { 'Cache-Control': 'no-store' }
  try {
    await query('select 1')
  } catch (error) {
    console.error('Database readiness check failed', error.code ?? error.name)
    return Response.json({ status: 'unavailable' }, { status: 503, headers })
  }
  return Response.json({ status: 'ok' }, { headers })
}
