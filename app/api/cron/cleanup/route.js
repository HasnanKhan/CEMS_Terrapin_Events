import { createHash, timingSafeEqual } from 'node:crypto'
import { cleanupExpired } from '../../../../lib/maintenance.js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const headers = { 'Cache-Control': 'no-store' }
const digest = value => createHash('sha256').update(value).digest()

export async function GET(request) {
  const secret = process.env.CRON_SECRET
  const authorization = request.headers.get('authorization')
  if (!secret || !authorization || !timingSafeEqual(digest(authorization), digest('Bearer ' + secret))) {
    return Response.json({ status: 'unauthorized' }, { status: 401, headers })
  }

  try {
    const counts = await cleanupExpired()
    return Response.json({ status: 'ok', ...counts }, { headers })
  } catch (error) {
    console.error('Scheduled cleanup failed', error.code ?? error.name)
    return Response.json({ status: 'unavailable' }, { status: 503, headers })
  }
}

// Next.js otherwise implements HEAD by calling GET.
export function HEAD() {
  return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, OPTIONS' } })
}
